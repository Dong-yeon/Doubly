/**
 * 길막기 — 연습 상대 AI. "도착까지 칸 수" 경주로 판단한다(docs/game-practice-tutorial_2026-10-13.md §3).
 * - 이번 수로 도착하면 간다.
 * - 내가 지고 있으면(상대가 먼저 도착) 벽 중에 "상대 거리 − 내 거리"를 가장 크게 벌리는 자리를 놓는다.
 * - 아니면 최단 길로 한 칸.
 * 보통은 위를 그대로 하고, 쉬움은 벽을 덜 쓰고(좋은 자리 중 아무거나) 가끔 엉뚱한 칸으로 간다.
 */
import { WALL_SLOTS, distance, placeWall, row, type WallKind } from './index';
import { AI_GOAL, ME_GOAL, canWall, legalMovesOf, type WallGame } from './local';

export type AiLevel = 'EASY' | 'NORMAL';
export type Rnd = () => number;
export type AiMove = { kind: 'move'; cell: number } | { kind: 'wall'; slot: number; wall: WallKind };

const EASY_WALL_CHANCE = 0.35;
const EASY_WANDER = 0.2;

function pick<T>(items: readonly T[], rnd: Rnd): T {
  return items[Math.floor(rnd() * items.length) % items.length];
}

/** 벽을 놓으면 (상대 거리, 내 거리)가 어떻게 되나 — 둘 다 상대 말은 무시한 최단 거리 */
export function wallEffect(g: WallGame, slot: number, kind: WallKind): { me: number; ai: number } {
  const walls = placeWall(g.walls, slot, kind);
  return { me: distance(walls, g.me, ME_GOAL), ai: distance(walls, g.ai, AI_GOAL) };
}

/** 가장 좋은 벽 후보들 — (상대 거리 늘린 만큼 − 내 거리 늘린 만큼)이 큰 순 */
export function bestWalls(g: WallGame): { slot: number; wall: WallKind; gain: number }[] {
  const meNow = distance(g.walls, g.me, ME_GOAL);
  const aiNow = distance(g.walls, g.ai, AI_GOAL);
  const out: { slot: number; wall: WallKind; gain: number }[] = [];
  for (let slot = 0; slot < WALL_SLOTS; slot += 1) {
    for (const wall of ['H', 'V'] as const) {
      if (!canWall(g, slot, wall)) continue;
      const e = wallEffect(g, slot, wall);
      const gain = (e.me - meNow) - (e.ai - aiNow);
      if (e.me - meNow > 0) out.push({ slot, wall, gain });
    }
  }
  return out.sort((a, b) => b.gain - a.gain);
}

export function chooseAiMove(g: WallGame, level: AiLevel, rnd: Rnd): AiMove {
  const moves = legalMovesOf(g, 'AI');
  const arrive = moves.filter((c) => row(c) === AI_GOAL);
  if (arrive.length > 0) return { kind: 'move', cell: pick(arrive, rnd) };

  const meDist = distance(g.walls, g.me, ME_GOAL);
  const aiDist = distance(g.walls, g.ai, AI_GOAL);
  // 내 차례라 한 수 앞선다 — 내 거리가 상대보다 길면 지고 있다
  const losing = aiDist > meDist;
  if (g.aiWalls > 0 && losing && (level === 'NORMAL' || rnd() < EASY_WALL_CHANCE)) {
    const walls = bestWalls(g);
    if (walls.length > 0 && walls[0].gain > 0) {
      const top = level === 'NORMAL' ? walls.filter((w) => w.gain === walls[0].gain) : walls.slice(0, 6);
      const w = pick(top, rnd);
      return { kind: 'wall', slot: w.slot, wall: w.wall };
    }
  }

  if (level === 'EASY' && rnd() < EASY_WANDER) return { kind: 'move', cell: pick(moves, rnd) };
  let best: number[] = [];
  let bestDist = Infinity;
  for (const m of moves) {
    const d = distance(g.walls, m, AI_GOAL);
    if (d < 0) continue;
    if (d < bestDist) {
      bestDist = d;
      best = [m];
    } else if (d === bestDist) best.push(m);
  }
  return { kind: 'move', cell: pick(best.length > 0 ? best : moves, rnd) };
}
