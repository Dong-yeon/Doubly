/**
 * 연쇄 퍼즐(뿌요뿌요형) 엔진 — 공용 타입과 상수. docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md.
 *
 * <p>이 폴더는 <b>렌더링이 없는 순수 함수</b>만 둔다. 화면(PuyoScreen)은 여기서 돌려준
 * 상태와 이벤트를 그리기만 하고, 규칙은 한 줄도 갖지 않는다 — 그래야
 * {@code scripts/verify-puyo.mjs} 가 규칙 전체를 Node 에서 돌려볼 수 있다(프론트에는
 * 테스트 러너가 없다, CLAUDE.md 6절).
 *
 * <p>Node 의 타입 제거 실행(verify 스크립트)을 위해 <b>enum 을 쓰지 않는다</b> — enum 은
 * 타입이 아니라 값이라 {@code --experimental-strip-types} 로 벗겨지지 않는다.
 */

/** 판 가로 칸 수 */
export const WIDTH = 6;
/**
 * 판 세로 칸 수 — 보이는 12줄 + <b>숨은 1줄(row 0)</b>. 뿌요뿌요의 13단 규칙 그대로다:
 * 맨 위 숨은 줄의 조각은 매치에 참여하지 않고, 회전 킥으로 조각이 잠시 거기까지 올라갈 수 있다.
 */
export const HEIGHT = 13;
export const HIDDEN_ROWS = 1;
export const VISIBLE_HEIGHT = HEIGHT - HIDDEN_ROWS;
/** 색 종류 — 1..COLOR_COUNT */
export const COLOR_COUNT = 4;
/** 같은 색이 이만큼 붙으면 사라진다 */
export const MATCH_SIZE = 4;

export const EMPTY = 0;
/** 방해 조각 — 매치하지 않고, 인접한 색이 사라질 때 함께 사라진다(§4-2 3번, 뿌요뿌요 규칙) */
export const GARBAGE = 5;

/** 칸 값 — 0 빈칸 · 1~4 색 · 5 방해 */
export type Cell = 0 | 1 | 2 | 3 | 4 | 5;
/** 판 — 길이 WIDTH*HEIGHT, index = row*WIDTH + col, row 0 이 맨 위(숨은 줄) */
export type Board = Cell[];

/** 조각 방향 — 자식이 축의 위(0)·오른쪽(1)·아래(2)·왼쪽(3) */
export type Rotation = 0 | 1 | 2 | 3;

/** 떨어지는 2개짜리 조각. {@code col,row} 는 축의 위치 */
export interface Piece {
  axis: Cell;
  child: Cell;
  col: number;
  row: number;
  rot: Rotation;
}

/** 연쇄 한 단계 — 화면이 순서대로 재생한다 */
export interface ChainStep {
  /** 1부터 */
  chain: number;
  /** 사라진 칸(방해 포함) index 목록 */
  cleared: number[];
  /** 사라진 색 조각 수(방해 제외) — 점수의 기준 */
  coloredCleared: number;
  /** 이 단계 점수 */
  score: number;
  /** 사라진 직후(중력 전) 판 — "터지는" 프레임 */
  boardAfterClear: Board;
  /** 중력까지 적용한 판 — 다음 단계의 시작 */
  boardAfterGravity: Board;
}

export type PlayerStatus = 'PLAYING' | 'LOST';

/** 한 사람의 판 전체 상태. 불변으로 다룬다 — 모든 함수가 새 객체를 돌려준다 */
export interface PlayerState {
  board: Board;
  /** 지금 떨어지는 조각. LOST 면 null */
  piece: Piece | null;
  /** 다음 조각 미리보기 — [축, 자식] */
  next: [Cell, Cell][];
  /** 조각 생성용 난수 상태(시드 기반 — 같은 시드면 둘이 같은 순서를 받는다) */
  rng: number;
  score: number;
  /** 방해 환산 나머지 점수 — TARGET_POINTS 미만은 다음 연쇄로 이월 */
  carry: number;
  /** 받았지만 아직 판에 안 들어온 방해(대기 큐, §2-3). 내 연쇄가 여기서 먼저 차감된다 */
  pendingGarbage: number;
  maxChain: number;
  /** 착지한 조각 수 = 수(手). 중력·방해 투입은 시간이 아니라 이 단위로 진행된다(§4-2 4번) */
  moves: number;
  status: PlayerStatus;
}

/** 조각 하나가 착지한 뒤 일어난 일 전부 — 화면 연출과 상대 전송의 재료 */
export interface LockOutcome {
  state: PlayerState;
  /** 착지 직후(중력 적용, 매치 전) 판 */
  boardAfterLock: Board;
  steps: ChainStep[];
  /** 대기 큐에서 상쇄한 양 */
  garbageOffset: number;
  /** 상쇄 후 상대에게 나가는 양 */
  garbageSent: number;
  /** 이번 수에 판으로 들어온 방해 칸 index */
  garbageDropped: number[];
  /** 방해가 들어온 뒤의 판(없으면 마지막 중력 판과 같다) */
  boardAfterGarbage: Board;
  lost: boolean;
}
