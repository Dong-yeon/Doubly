/**
 * 오목 — 연습 상대 AI. docs/game-practice-tutorial_2026-10-13.md §3 "패턴 점수식".
 *
 * 칸마다 그 칸을 지나는 다섯 칸 창(가로·세로·두 대각, 창 하나에 상대 돌이 없을 때만)을 모두 보고, 창 안의 내 돌
 * 수로 점수를 매긴다. 같은 칸을 상대 기준으로도 매겨(막기) 더한다. 띈 모양(○○_○)도 창으로 자연히 잡힌다.
 * - 보통: 이기는 칸이면 둔다 → 상대가 다음에 이길 칸이면 막는다 → 공격+막기 점수가 가장 높은 칸.
 * - 쉬움: 막기 비중이 낮고 점수에 흔들림을 섞는다. 이길 칸·막을 칸도 가끔 놓친다 — 처음 하는 사람이 이겨 볼 수 있게.
 *
 * 무작위는 rnd 로 받는다 — 검증 스크립트가 시드를 고정한다.
 */
import { CELLS, EMPTY, SIZE, other, winningCells, type Stone } from './index';

export type AiLevel = 'EASY' | 'NORMAL';
export type Rnd = () => number;

/** 창 안 내 돌 수(이 칸 포함) → 점수. 다섯이면 승리 */
const WINDOW_SCORE = [0, 1, 8, 60, 600, 100000];
const DIRECTIONS: readonly [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];

const EASY_SPOTS_WIN = 0.8;
const EASY_SPOTS_BLOCK = 0.6;

/** index 에 color 를 둔다고 칠 때의 점수 — 그 칸을 지나는 다섯 칸 창의 합 */
export function cellScore(board: readonly number[], index: number, color: Stone): number {
  const row = Math.floor(index / SIZE);
  const col = index % SIZE;
  const opp = other(color);
  let total = 0;
  for (const [dr, dc] of DIRECTIONS) {
    for (let k = 0; k < 5; k += 1) {
      const sr = row - dr * k;
      const sc = col - dc * k;
      const er = sr + dr * 4;
      const ec = sc + dc * 4;
      if (sr < 0 || sr >= SIZE || sc < 0 || sc >= SIZE || er < 0 || er >= SIZE || ec < 0 || ec >= SIZE) continue;
      let own = 0;
      let blocked = false;
      for (let j = 0; j < 5; j += 1) {
        const i = (sr + dr * j) * SIZE + (sc + dc * j);
        if (i === index || board[i] === color) own += 1;
        else if (board[i] === opp) {
          blocked = true;
          break;
        }
      }
      if (!blocked) total += WINDOW_SCORE[own];
    }
  }
  return total;
}

/** 돌 근처(두 칸 안)의 빈 칸 — 판이 비었으면 가운데 */
export function candidates(board: readonly number[]): number[] {
  const near = new Set<number>();
  let any = false;
  for (let i = 0; i < CELLS; i += 1) {
    if (board[i] === EMPTY) continue;
    any = true;
    const r = Math.floor(i / SIZE);
    const c = i % SIZE;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue;
        const j = rr * SIZE + cc;
        if (board[j] === EMPTY) near.add(j);
      }
    }
  }
  if (!any) return [Math.floor(SIZE / 2) * SIZE + Math.floor(SIZE / 2)];
  return [...near];
}

function pick<T>(items: readonly T[], rnd: Rnd): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

export function chooseMove(board: readonly number[], color: Stone, level: AiLevel, rnd: Rnd): number {
  const cands = candidates(board);
  const myWins = winningCells(board, color);
  const theirWins = winningCells(board, other(color));

  if (level === 'NORMAL') {
    if (myWins.length > 0) return pick(myWins, rnd);
    if (theirWins.length > 0) return pick(theirWins, rnd);
  } else {
    if (myWins.length > 0 && rnd() < EASY_SPOTS_WIN) return pick(myWins, rnd);
    if (theirWins.length > 0 && rnd() < EASY_SPOTS_BLOCK) return pick(theirWins, rnd);
  }

  const defenseWeight = level === 'NORMAL' ? 0.95 : 0.5;
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const c of cands) {
    // 쉬움은 이미 이길·막을 칸을 "놓치기로" 했으면 그 칸을 피한다 — 점수표가 다시 그 칸을 고르지 않게
    if (level === 'EASY' && (myWins.includes(c) || theirWins.includes(c))) continue;
    let score = cellScore(board, c, color) + defenseWeight * cellScore(board, c, other(color));
    if (level === 'EASY') score += rnd() * 300;
    if (score > bestScore + 1e-9) {
      bestScore = score;
      best = [c];
    } else if (Math.abs(score - bestScore) <= 1e-9) {
      best.push(c);
    }
  }
  if (best.length === 0) return pick(cands, rnd);
  return pick(best, rnd);
}
