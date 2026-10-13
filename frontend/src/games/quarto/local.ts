/**
 * 넷이 같아 — 연습 판 엔진. 연습은 서버를 거치지 않으므로(docs/game-practice-tutorial_2026-10-13.md §2) 한 수 적용을
 * 앱이 직접 한다. 규칙은 서버 QuartoGame.apply 와 같다 — 첫 수는 말 주기뿐, 놓은 칸을 지나는 줄로 판정, 놓은 사람만
 * 이김, 15번째 놓기 뒤 마지막 말은 저절로 건네짐, 16번째에 줄이 없으면 무승부. 검증은 scripts/verify-quarto.mjs.
 */
import { CELLS, EMPTY, remainingPieces, winningLineThrough } from './index';

export type Side = 'ME' | 'AI';

export interface LocalMove {
  side: Side;
  place: number | null;
  /** 이 수에 놓은 말 */
  piece: number | null;
  give: number | null;
}

export interface LocalGame {
  board: number[];
  /** 지금 놓아야 할 말 */
  pending: number | null;
  /** 지금까지 둔 수 — 0 번째는 첫 말 주기 */
  moveNo: number;
  /** 0 번째 수(첫 말 주기)를 하는 쪽 */
  first: Side;
  winner: Side | 'DRAW' | null;
  winLine: number[] | null;
  history: LocalMove[];
}

export function newLocalGame(first: Side): LocalGame {
  return { board: Array<number>(CELLS).fill(EMPTY), pending: null, moveNo: 0, first, winner: null, winLine: null, history: [] };
}

export function other(side: Side): Side {
  return side === 'ME' ? 'AI' : 'ME';
}

/** 지금 둘 쪽 — 짝수 번째 수는 first */
export function turnOf(g: LocalGame): Side {
  return g.moveNo % 2 === 0 ? g.first : other(g.first);
}

export function isOver(g: LocalGame): boolean {
  return g.winner != null;
}

/**
 * 한 수를 적용한 새 판. 잘못된 수면 Error — 앱 화면은 고를 수 있는 것만 보여 주므로 이건 버그 신호다.
 * 15번째 놓기 뒤처럼 남은 말이 하나뿐이면 give 를 비워도 그 말이 건네진다.
 */
export function applyLocal(g: LocalGame, side: Side, place: number | null, give: number | null): LocalGame {
  if (g.winner) throw new Error('끝난 판');
  if (turnOf(g) !== side) throw new Error('차례 아님');

  if (g.moveNo === 0) {
    if (place != null || give == null) throw new Error('첫 수는 말 주기뿐');
    return { ...g, pending: give, moveNo: 1, history: [...g.history, { side, place: null, piece: null, give }] };
  }
  if (place == null || g.pending == null) throw new Error('놓을 칸이 없음');
  if (g.board[place] !== EMPTY) throw new Error('채워진 칸');

  const piece = g.pending;
  const board = [...g.board];
  board[place] = piece;
  const line = winningLineThrough(board, place);
  const left = remainingPieces(board, null);
  const base = { ...g, board, moveNo: g.moveNo + 1 };

  if (line) {
    if (give != null) throw new Error('이기는 수에는 말을 주지 않는다');
    return { ...base, pending: null, winner: side, winLine: line, history: [...g.history, { side, place, piece, give: null }] };
  }
  if (left.length === 0) {
    return { ...base, pending: null, winner: 'DRAW', history: [...g.history, { side, place, piece, give: null }] };
  }
  const next = left.length === 1 ? left[0] : give;
  if (next == null || !left.includes(next)) throw new Error('건넬 수 없는 말');
  return { ...base, pending: next, history: [...g.history, { side, place, piece, give: next }] };
}
