/**
 * 넷이 같아 — 연습 상대 AI. docs/game-practice-tutorial_2026-10-13.md §3.
 *
 * 두 단계다.
 * - 쉬움: 이길 수 있는 칸을 절반쯤 놓치고, 건넬 말은 아무거나 준다 — 처음 하는 사람이 "이길 기회"를 직접 겪게.
 * - 보통: 이길 수 있으면 반드시 이기고, 상대가 바로 이길 말은 주지 않는다. 그런 말을 가장 많이 남기는 칸에 놓는다.
 *   빈 칸이 ENDGAME_CELLS 이하면 끝까지 읽는다(완전 탐색).
 *
 * 무작위는 rnd 로 받는다 — 검증 스크립트가 시드를 고정해 결과를 재현한다.
 */
import { EMPTY, remainingPieces, winningLineThrough } from './index';

export type AiLevel = 'EASY' | 'NORMAL';
export type Rnd = () => number;

/** 끝까지 읽기 시작하는 빈 칸 수 — 6이면 최악 6!·5! ≈ 9만 노드라 한 번에 수십 ms 안쪽이다 */
const ENDGAME_CELLS = 6;
/** 쉬움이 이길 칸을 알아채는 확률 */
const EASY_SPOTS_WIN = 0.5;

export function emptyCells(board: readonly number[]): number[] {
  const out: number[] = [];
  board.forEach((p, i) => { if (p === EMPTY) out.push(i); });
  return out;
}

/** piece 를 놓으면 바로 이기는 칸들 */
export function winningCells(board: readonly number[], piece: number): number[] {
  const out: number[] = [];
  for (const c of emptyCells(board)) {
    const next = [...board];
    next[c] = piece;
    if (winningLineThrough(next, c)) out.push(c);
  }
  return out;
}

/** 이 말을 건네도 받는 쪽이 바로 이길 칸이 없는가 */
export function isSafeGive(board: readonly number[], piece: number): boolean {
  return winningCells(board, piece).length === 0;
}

function pick<T>(items: readonly T[], rnd: Rnd): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

/**
 * 완전 탐색 — piece 를 놓을 차례인 쪽 기준 점수(이김 1 · 비김 0 · 짐 -1)와 그 수.
 * 놓은 뒤 남은 말이 없으면 비김. 이기는 수를 찾으면 바로 끊는다.
 */
function solve(board: number[], piece: number): { score: number; place: number; give: number | null } {
  const empties = emptyCells(board);
  for (const c of empties) {
    board[c] = piece;
    const win = winningLineThrough(board, c);
    board[c] = EMPTY;
    if (win) return { score: 1, place: c, give: null };
  }
  let best = { score: -2, place: empties[0], give: null as number | null };
  for (const c of empties) {
    board[c] = piece;
    const left = remainingPieces(board, null);
    if (left.length === 0) {
      if (best.score < 0) best = { score: 0, place: c, give: null };
    } else {
      for (const g of left) {
        const score = -solve(board, g).score;
        if (score > best.score) best = { score, place: c, give: g };
        if (best.score === 1) break;
      }
    }
    board[c] = EMPTY;
    if (best.score === 1) break;
  }
  return best;
}

/** 첫 수(말 주기) — 빈 판이라 어떤 말이든 안전하다 */
export function chooseFirstGive(rnd: Rnd): number {
  return Math.floor(rnd() * 16) % 16;
}

/** 받은 말을 놓고 건넬 말을 고른다. give 가 null 이면 이긴 수이거나 마지막 수다(15번째 뒤 건넬 말은 엔진이 채운다) */
export function chooseMove(board: readonly number[], piece: number, level: AiLevel, rnd: Rnd): { place: number; give: number | null } {
  const empties = emptyCells(board);
  const wins = winningCells(board, piece);

  if (level === 'EASY') {
    if (wins.length > 0 && rnd() < EASY_SPOTS_WIN) return { place: pick(wins, rnd), give: null };
    // 이길 칸을 "놓쳤으면" 그 칸은 피해서 놓는다 — 놓고 보니 이긴 수가 되면 놓친 게 아니게 되므로
    const others = empties.filter((c) => !wins.includes(c));
    const place = others.length > 0 ? pick(others, rnd) : pick(wins, rnd);
    if (wins.includes(place)) return { place, give: null };
    const next = [...board];
    next[place] = piece;
    const left = remainingPieces(next, null);
    return { place, give: left.length === 0 ? null : pick(left, rnd) };
  }

  if (wins.length > 0) return { place: pick(wins, rnd), give: null };

  if (empties.length <= ENDGAME_CELLS) {
    const best = solve([...board], piece);
    // 끝까지 읽어 이기거나 비기는 길이 있으면 그 수. 어차피 지는 판이면 아무 수나 고르는 대신 아래 휴리스틱으로
    // 버틴다 — 사람은 끝까지 못 읽으니 "바로 지는 말"을 주지 않는 쪽이 이길 기회를 남긴다
    if (best.score >= 0) return { place: best.place, give: best.give };
  }

  // 놓은 뒤 "안전하게 건넬 말"이 가장 많이 남는 칸 — 상대를 궁지로 모는 건 그 수가 줄어드는 쪽이다
  let bestCells: { place: number; safe: number[]; left: number[] }[] = [];
  let bestCount = -1;
  for (const c of empties) {
    const next = [...board];
    next[c] = piece;
    const left = remainingPieces(next, null);
    const safe = left.filter((g) => isSafeGive(next, g));
    if (safe.length > bestCount) {
      bestCount = safe.length;
      bestCells = [{ place: c, safe, left }];
    } else if (safe.length === bestCount) {
      bestCells.push({ place: c, safe, left });
    }
  }
  const choice = pick(bestCells, rnd);
  if (choice.left.length === 0) return { place: choice.place, give: null };
  return { place: choice.place, give: pick(choice.safe.length > 0 ? choice.safe : choice.left, rnd) };
}
