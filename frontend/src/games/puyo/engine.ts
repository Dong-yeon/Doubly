/**
 * 한 사람의 판 진행 — 조각 생성·조작·착지·연쇄·상쇄·방해 투입·패배 판정.
 *
 * <p>전부 순수 함수다. 화면은 {@link PlayerState} 를 들고 있다가 입력마다 여기 함수를 불러
 * 새 상태로 바꾸고, 착지 때 돌아오는 {@link LockOutcome} 의 단계들을 순서대로 그린다.
 * 시간(중력 타이머)은 화면의 것이고 엔진은 모른다 — {@link softDrop} 을 언제 부를지는
 * 호출자가 정한다(§4-2 4번: 진행은 수(手) 기준).
 */
import {
  type Board,
  type Cell,
  type LockOutcome,
  type Piece,
  type PlayerState,
  type Rotation,
  COLOR_COUNT,
  EMPTY,
  GARBAGE,
  HEIGHT,
  WIDTH,
} from './types';
import { applyGravity, cellIndex, emptyBoard, resolveChains } from './board';
import { dropToBottom, fallOne, fits, lockPiece, movePiece, rotatePiece, spawnPiece } from './piece';
import { MAX_GARBAGE_PER_DROP, garbageFromScore, offsetGarbage } from './scoring';
import { nextInt, seedRng } from './rng';

/** 미리보기 조각 수 */
export const PREVIEW_COUNT = 2;

/** 기보 한 수(§2-6) — 어디에 어떤 조각을 어떻게 두었는가. elapsedMs 는 호출자가 붙인다 */
export interface Move {
  col: number;
  rot: Rotation;
  axis: Cell;
  child: Cell;
}

function randomPair(rng: number): [[Cell, Cell], number] {
  const [a, r1] = nextInt(rng, COLOR_COUNT);
  const [b, r2] = nextInt(r1, COLOR_COUNT);
  return [[(a + 1) as Cell, (b + 1) as Cell], r2];
}

/** 시드에서 새 판. 같은 시드는 같은 조각 순서다 */
export function createPlayer(seed: number): PlayerState {
  let rng = seedRng(seed);
  const next: [Cell, Cell][] = [];
  for (let i = 0; i < PREVIEW_COUNT + 1; i++) {
    const [pair, r] = randomPair(rng);
    next.push(pair);
    rng = r;
  }
  const first = next.shift() as [Cell, Cell];
  return {
    board: emptyBoard(),
    piece: spawnPiece(first[0], first[1]),
    next,
    rng,
    score: 0,
    carry: 0,
    pendingGarbage: 0,
    maxChain: 0,
    moves: 0,
    status: 'PLAYING',
  };
}

export function moveLeft(state: PlayerState): PlayerState {
  if (!state.piece) return state;
  const piece = movePiece(state.board, state.piece, -1);
  return piece ? { ...state, piece } : state;
}

export function moveRight(state: PlayerState): PlayerState {
  if (!state.piece) return state;
  const piece = movePiece(state.board, state.piece, 1);
  return piece ? { ...state, piece } : state;
}

export function rotate(state: PlayerState, dir: -1 | 1 = 1): PlayerState {
  if (!state.piece) return state;
  const piece = rotatePiece(state.board, state.piece, dir);
  return piece ? { ...state, piece } : state;
}

/**
 * 한 칸 내린다. 바닥이면 착지시키고 {@code locked} 에 결과를 준다 — 중력 타이머와
 * "내리기" 입력이 같은 함수를 부른다.
 */
export function softDrop(state: PlayerState): { state: PlayerState; locked: LockOutcome | null } {
  if (!state.piece) return { state, locked: null };
  const piece = fallOne(state.board, state.piece);
  if (piece) return { state: { ...state, piece }, locked: null };
  const locked = lock(state);
  return { state: locked.state, locked };
}

/** 끝까지 내려 바로 착지 */
export function hardDrop(state: PlayerState): LockOutcome {
  if (!state.piece) throw new Error('no piece to drop');
  return lock({ ...state, piece: dropToBottom(state.board, state.piece) });
}

/** 상대가 보낸 방해를 대기 큐에 넣는다. 판에는 다음 착지 뒤에 들어온다(§2-3) */
export function receiveGarbage(state: PlayerState, amount: number): PlayerState {
  if (amount <= 0) return state;
  return { ...state, pendingGarbage: state.pendingGarbage + amount };
}

/** 지금 조각의 기보 표현 */
export function describeMove(piece: Piece): Move {
  return { col: piece.col, rot: piece.rot, axis: piece.axis, child: piece.child };
}

/**
 * 착지 — 이 게임의 한 수 전체.
 * <ol>
 *   <li>조각을 판에 쓰고 중력(가로 조각은 열마다 따로 떨어진다)</li>
 *   <li>연쇄를 끝까지(매치 → 제거 → 중력 반복)</li>
 *   <li>점수 → 방해 환산, 대기 큐와 상쇄, 남는 만큼 상대에게</li>
 *   <li>상쇄하고도 남은 대기 방해를 판에 투입(한 수에 최대 5줄)</li>
 *   <li>다음 조각 생성. 자리가 없으면 패배</li>
 * </ol>
 * 연쇄가 났을 때 방해가 같은 수에 들어오지 않는 것도 뿌요뿌요 규칙이다 — 연쇄 중에는
 * 상쇄만 하고, 투입은 연쇄가 없던 수의 착지 뒤에만 일어난다.
 */
export function lock(state: PlayerState): LockOutcome {
  if (!state.piece) throw new Error('no piece to lock');
  const boardAfterLock = applyGravity(lockPiece(state.board, state.piece));
  const { board: settled, steps } = resolveChains(boardAfterLock);

  const gained = steps.reduce((n, s) => n + s.score, 0);
  const { garbage: produced, carry } = garbageFromScore(gained, state.carry);
  const { pending, sent, offset } = offsetGarbage(state.pendingGarbage, produced);

  let board = settled;
  let rng = state.rng;
  let pendingAfter = pending;
  let garbageDropped: number[] = [];
  if (steps.length === 0 && pendingAfter > 0) {
    const amount = Math.min(pendingAfter, MAX_GARBAGE_PER_DROP);
    const dropped = dropGarbage(board, rng, amount);
    board = dropped.board;
    rng = dropped.rng;
    garbageDropped = dropped.dropped;
    pendingAfter -= amount;
  }

  const [pair, rngAfterPair] = randomPair(rng);
  const nextQueue = [...state.next, pair];
  const upcoming = nextQueue.shift() as [Cell, Cell];
  const piece = spawnPiece(upcoming[0], upcoming[1]);
  const lost = !fits(board, piece);

  const chain = steps.length;
  const next: PlayerState = {
    board,
    piece: lost ? null : piece,
    next: nextQueue,
    rng: rngAfterPair,
    score: state.score + gained,
    carry,
    pendingGarbage: pendingAfter,
    maxChain: Math.max(state.maxChain, chain),
    moves: state.moves + 1,
    status: lost ? 'LOST' : 'PLAYING',
  };
  return {
    state: next,
    boardAfterLock,
    steps,
    garbageOffset: offset,
    garbageSent: sent,
    garbageDropped,
    boardAfterGarbage: board,
    lost,
  };
}

/**
 * 방해 투입 — 꽉 찬 줄부터 채우고, 나머지는 무작위 열에 하나씩. 각 열의 맨 위 빈칸에
 * 놓는다(정리된 판이 입력이라 곧 "쌓인 것 위"다). 열이 이미 꽉 찼으면 그 방해는 사라진다
 * (뿌요뿌요도 판 밖으로 넘친 방해는 버린다).
 */
export function dropGarbage(board: Board, rng: number, amount: number): { board: Board; rng: number; dropped: number[] } {
  const next = board.slice() as Board;
  const dropped: number[] = [];
  const fullRows = Math.floor(amount / WIDTH);
  const rest = amount % WIDTH;

  const place = (col: number) => {
    for (let row = HEIGHT - 1; row >= 0; row--) {
      const i = cellIndex(col, row);
      if (next[i] === EMPTY) {
        next[i] = GARBAGE;
        dropped.push(i);
        return;
      }
    }
  };

  for (let r = 0; r < fullRows; r++) {
    for (let col = 0; col < WIDTH; col++) place(col);
  }
  // 나머지 — 열을 섞어 앞에서 rest 개
  const cols = [0, 1, 2, 3, 4, 5];
  let state = rng;
  for (let i = cols.length - 1; i > 0; i--) {
    const [j, s] = nextInt(state, i + 1);
    state = s;
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  for (let k = 0; k < rest; k++) place(cols[k]);

  return { board: next, rng: state, dropped: dropped.sort((a, b) => a - b) };
}
