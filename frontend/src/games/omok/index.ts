/**
 * 오목 — 연습 판용 규칙. 서버 OmokRules 와 같다: 방금 놓은 돌을 지나는 네 방향에서 같은 돌이 다섯 이상
 * 이어지면 승리(장목 허용, 렌주 제한 없음). 판이 다 차면 무승부. docs/game-practice-tutorial_2026-10-13.md.
 *
 * 판은 칸 225개 배열 — 0 빈 칸, 1 흑, 2 백. 칸 번호는 row * 15 + col.
 * import 가 없는 순수 모듈로 둔다 — 검증 스크립트(scripts/verify-omok.mjs)가 Node 에서 바로 읽는다.
 */

export const SIZE = 15;
export const CELLS = SIZE * SIZE;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const WIN_LENGTH = 5;

export type Stone = typeof BLACK | typeof WHITE;

const DIRECTIONS: readonly [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

export function other(color: Stone): Stone {
  return color === BLACK ? WHITE : BLACK;
}

export function emptyBoard(): number[] {
  return Array<number>(CELLS).fill(EMPTY);
}

/** index 의 돌이 만든 연속 다섯(이상) — 없으면 null. 서버와 같이 그 방향의 연속 전체를 정렬해 돌려준다 */
export function winningLine(board: readonly number[], index: number): number[] | null {
  const side = board[index];
  if (side === EMPTY) return null;
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE && board[r * SIZE + c] === side) {
        line.push(r * SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= WIN_LENGTH) return line.sort((a, b) => a - b);
  }
  return null;
}

/** color 가 두면 바로 이기는 빈 칸들 */
export function winningCells(board: readonly number[], color: Stone): number[] {
  const out: number[] = [];
  const work = [...board];
  for (let i = 0; i < CELLS; i += 1) {
    if (work[i] !== EMPTY) continue;
    work[i] = color;
    if (winningLine(work, i)) out.push(i);
    work[i] = EMPTY;
  }
  return out;
}

export function isFull(board: readonly number[]): boolean {
  return board.every((v) => v !== EMPTY);
}

export const cellName = (i: number) => `${Math.floor(i / SIZE) + 1}행 ${(i % SIZE) + 1}열`;

/** [행, 열, 'B'|'W'] 목록으로 판 만들기 — 레슨 데이터용(행·열은 0부터) */
export function boardOf(stones: readonly (readonly [number, number, 'B' | 'W'])[]): number[] {
  const b = emptyBoard();
  for (const [r, c, s] of stones) b[r * SIZE + c] = s === 'B' ? BLACK : WHITE;
  return b;
}
