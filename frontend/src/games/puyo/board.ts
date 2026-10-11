/**
 * 판 연산 — 중력·매치·연쇄. 전부 순수 함수이고 입력 판을 바꾸지 않는다.
 *
 * <p><b>순서가 규칙이다(§4-2 1번)</b>: 매치 제거 → 중력 → 재매치. {@link resolveChains} 가
 * 이 순서를 고정하고, 화면은 그 결과(ChainStep 목록)를 재생만 한다.
 */
import {
  type Board,
  type Cell,
  type ChainStep,
  EMPTY,
  GARBAGE,
  HEIGHT,
  HIDDEN_ROWS,
  MATCH_SIZE,
  WIDTH,
} from './types';
import { chainScore } from './scoring';

export function emptyBoard(): Board {
  return new Array<Cell>(WIDTH * HEIGHT).fill(EMPTY);
}

export function cellIndex(col: number, row: number): number {
  return row * WIDTH + col;
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < WIDTH && row >= 0 && row < HEIGHT;
}

/** 칸이 비어 있는가. 판 밖은 "막힘"으로 본다 */
export function isFree(board: Board, col: number, row: number): boolean {
  return inBounds(col, row) && board[cellIndex(col, row)] === EMPTY;
}

/**
 * 판 ↔ 문자열. 78자리 숫자열(스도쿠 {@code board VARCHAR(81)} 과 같은 발상) — 나중에
 * {@code couple_games} 컬럼과 소켓 페이로드(§2-5)에 그대로 실린다.
 */
export function encodeBoard(board: Board): string {
  return board.join('');
}

export function decodeBoard(text: string): Board {
  if (text.length !== WIDTH * HEIGHT) throw new Error(`board length ${text.length} != ${WIDTH * HEIGHT}`);
  const board: Board = [];
  for (let i = 0; i < text.length; i++) {
    const v = text.charCodeAt(i) - 48;
    if (v < 0 || v > GARBAGE) throw new Error(`bad cell '${text[i]}' at ${i}`);
    board.push(v as Cell);
  }
  return board;
}

/** 열 단위 중력 — 각 열의 조각을 바닥부터 채운다(빈칸이 위로 모인다) */
export function applyGravity(board: Board): Board {
  const out = emptyBoard();
  for (let col = 0; col < WIDTH; col++) {
    let write = HEIGHT - 1;
    for (let row = HEIGHT - 1; row >= 0; row--) {
      const v = board[cellIndex(col, row)];
      if (v !== EMPTY) {
        out[cellIndex(col, write)] = v;
        write--;
      }
    }
  }
  return out;
}

function neighborsOf(i: number): [number, number][] {
  const c = i % WIDTH;
  const r = (i - c) / WIDTH;
  return [
    [c - 1, r],
    [c + 1, r],
    [c, r - 1],
    [c, r + 1],
  ];
}

/**
 * 사라질 무리 — 같은 색이 MATCH_SIZE 이상 붙은 것. 4방 이웃, 직사각 그리드라
 * {@code ±1 / ±WIDTH} 로 끝난다(§4-1 — 발사형을 버린 이유).
 *
 * <p>숨은 줄(row < HIDDEN_ROWS)의 조각은 무리에 넣지 않는다 — 뿌요뿌요 13단 규칙.
 * 방해(GARBAGE)는 색이 아니므로 무리를 만들지 않는다.
 */
export function findGroups(board: Board): number[][] {
  const seen = new Uint8Array(board.length);
  const groups: number[][] = [];
  for (let row = HIDDEN_ROWS; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const start = cellIndex(col, row);
      const color = board[start];
      if (seen[start] || color === EMPTY || color === GARBAGE) continue;
      const group: number[] = [];
      const stack = [start];
      seen[start] = 1;
      while (stack.length > 0) {
        const i = stack.pop() as number;
        group.push(i);
        for (const [nc, nr] of neighborsOf(i)) {
          if (nc < 0 || nc >= WIDTH || nr < HIDDEN_ROWS || nr >= HEIGHT) continue;
          const ni = cellIndex(nc, nr);
          if (!seen[ni] && board[ni] === color) {
            seen[ni] = 1;
            stack.push(ni);
          }
        }
      }
      if (group.length >= MATCH_SIZE) groups.push(group);
    }
  }
  return groups;
}

/**
 * 무리를 지운다. 무리에 <b>붙어 있는 방해</b>도 함께 지운다(§4-2 3번 — 방해를 없애는
 * 유일한 수단). 숨은 줄의 방해도 인접하면 지워진다(뿌요뿌요와 같다).
 */
export function clearGroups(board: Board, groups: number[][]): { board: Board; cleared: number[] } {
  const next = board.slice() as Board;
  const clearedSet = new Set<number>();
  for (const group of groups) {
    for (const i of group) {
      clearedSet.add(i);
      for (const [nc, nr] of neighborsOf(i)) {
        if (!inBounds(nc, nr)) continue;
        const ni = cellIndex(nc, nr);
        if (board[ni] === GARBAGE) clearedSet.add(ni);
      }
    }
  }
  const cleared = [...clearedSet].sort((a, b) => a - b);
  for (const i of cleared) next[i] = EMPTY;
  return { board: next, cleared };
}

/**
 * 연쇄를 끝까지 돌린다: 중력 → (매치 → 제거 → 중력)* . 입력 판에 떠 있는 조각이 있어도
 * 첫 중력이 정리하므로, 착지 직후의 판을 그대로 넣으면 된다.
 */
export function resolveChains(board: Board): { board: Board; steps: ChainStep[] } {
  let current = applyGravity(board);
  const steps: ChainStep[] = [];
  for (;;) {
    const groups = findGroups(current);
    if (groups.length === 0) break;
    const chain = steps.length + 1;
    const { board: afterClear, cleared } = clearGroups(current, groups);
    const coloredCleared = groups.reduce((n, g) => n + g.length, 0);
    const colors = new Set(groups.map((g) => current[g[0]])).size;
    const score = chainScore(chain, coloredCleared, colors, groups.map((g) => g.length));
    const afterGravity = applyGravity(afterClear);
    steps.push({ chain, cleared, coloredCleared, score, boardAfterClear: afterClear, boardAfterGravity: afterGravity });
    current = afterGravity;
  }
  return { board: current, steps };
}
