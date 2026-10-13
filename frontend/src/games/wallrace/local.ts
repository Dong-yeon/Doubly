/**
 * 길막기 — 연습 판 엔진. 나는 늘 아래(9행)에서 출발해 맨 윗줄로 가고, AI 는 위에서 아래로 간다. 내가 먼저 둔다
 * (실전에서 선공인 "판을 열지 않은 쪽"과 같은 자리 — 공용 판 그림의 벽 주인 색이 그 순서를 따른다).
 * 기보는 실전과 같은 'P<칸>' / 'W<자리><H|V>' 문자열이다. 규칙은 ./index(서버 WallRaceRules 와 같음).
 */
import {
  SIZE,
  emptyWalls,
  isLegalWall,
  legalMoves,
  placeWall,
  row,
  startCell,
  type WallKind,
} from './index';

export type Side = 'ME' | 'AI';
export const ME_GOAL = 0;
export const AI_GOAL = SIZE - 1;
export const WALLS_PER_SIDE = 10;

export interface WallGame {
  walls: string;
  me: number;
  ai: number;
  meWalls: number;
  aiWalls: number;
  turn: Side;
  moves: string[];
  winner: Side | null;
}

export function newWallGame(wallsEach = WALLS_PER_SIDE): WallGame {
  return {
    walls: emptyWalls(),
    me: startCell(ME_GOAL),
    ai: startCell(AI_GOAL),
    meWalls: wallsEach,
    aiWalls: wallsEach,
    turn: 'ME',
    moves: [],
    winner: null,
  };
}

const pawnOf = (g: WallGame, s: Side) => (s === 'ME' ? g.me : g.ai);
const goalOf = (s: Side) => (s === 'ME' ? ME_GOAL : AI_GOAL);
const other = (s: Side): Side => (s === 'ME' ? 'AI' : 'ME');

export function legalMovesOf(g: WallGame, s: Side): number[] {
  return legalMoves(g.walls, pawnOf(g, s), pawnOf(g, other(s)));
}

/** 말 이동 — 갈 수 없는 칸이면 Error(화면은 갈 수 있는 칸만 보여 주므로 버그 신호) */
export function moveLocal(g: WallGame, s: Side, target: number): WallGame {
  if (g.winner || g.turn !== s) throw new Error('차례 아님');
  if (!legalMovesOf(g, s).includes(target)) throw new Error('갈 수 없는 칸');
  const next = { ...g, moves: [...g.moves, `P${target}`], turn: other(s) };
  if (s === 'ME') next.me = target;
  else next.ai = target;
  if (row(target) === goalOf(s)) next.winner = s;
  return next;
}

export function canWall(g: WallGame, slot: number, kind: WallKind): boolean {
  return isLegalWall(g.walls, slot, kind, g.me, ME_GOAL, g.ai, AI_GOAL);
}

export function wallLocal(g: WallGame, s: Side, slot: number, kind: WallKind): WallGame {
  if (g.winner || g.turn !== s) throw new Error('차례 아님');
  if ((s === 'ME' ? g.meWalls : g.aiWalls) <= 0) throw new Error('벽 없음');
  if (!canWall(g, slot, kind)) throw new Error('놓을 수 없는 벽');
  return {
    ...g,
    walls: placeWall(g.walls, slot, kind),
    meWalls: s === 'ME' ? g.meWalls - 1 : g.meWalls,
    aiWalls: s === 'AI' ? g.aiWalls - 1 : g.aiWalls,
    moves: [...g.moves, `W${slot}${kind}`],
    turn: other(s),
  };
}
