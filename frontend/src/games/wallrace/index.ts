/**
 * 길막기 — 연습 판용 규칙. 서버 WallRaceRules 를 그대로 옮겼다(사용자 결정 2026-10-13: 연습은 앱 안에서만 돌므로
 * 규칙을 앱에도 둔다). 두 벌이 어긋나지 않게 scripts/verify-wallrace.mjs 가 서버 WallRaceRulesTest 와 같은 케이스를 돌린다.
 *
 * 좌표: 칸 0~80(row * 9 + col, row 0 이 위), 벽 자리 0~63(교차점 r * 8 + c). 벽 문자열 64자 '0'/'H'/'V'.
 * 가로(H) 벽은 (r,c)↔(r+1,c)·(r,c+1)↔(r+1,c+1) 을, 세로(V) 벽은 (r,c)↔(r,c+1)·(r+1,c)↔(r+1,c+1) 을 막는다.
 *
 * import 가 없는 순수 모듈 — 검증 스크립트가 Node 에서 바로 읽는다.
 */

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
export const WALL_SIZE = SIZE - 1;
export const WALL_SLOTS = WALL_SIZE * WALL_SIZE;
export const WALL_NONE = '0';
export type WallKind = 'H' | 'V';

export const row = (cell: number) => Math.floor(cell / SIZE);
export const col = (cell: number) => cell % SIZE;
export const cellOf = (r: number, c: number) => r * SIZE + c;
const inBoard = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export function emptyWalls(): string {
  return WALL_NONE.repeat(WALL_SLOTS);
}

function hasWall(walls: string, r: number, c: number, kind: WallKind): boolean {
  if (r < 0 || r >= WALL_SIZE || c < 0 || c >= WALL_SIZE) return false;
  return walls[r * WALL_SIZE + c] === kind;
}

/** 상하좌우로 붙은 두 칸 사이가 벽으로 막혔는가 */
export function blocked(walls: string, from: number, to: number): boolean {
  const r1 = row(from);
  const c1 = col(from);
  const r2 = row(to);
  if (r1 === r2) {
    const c = Math.min(c1, col(to));
    return hasWall(walls, r1 - 1, c, 'V') || hasWall(walls, r1, c, 'V');
  }
  const r = Math.min(r1, r2);
  return hasWall(walls, r, c1 - 1, 'H') || hasWall(walls, r, c1, 'H');
}

/** 겹침만 본다(경로는 wallKeepsBothPaths) — 같은 교차점, 붙은 같은 방향 벽 */
export function canPlaceWall(walls: string, slot: number, kind: string): boolean {
  if (kind !== 'H' && kind !== 'V') return false;
  if (slot < 0 || slot >= WALL_SLOTS) return false;
  if (walls[slot] !== WALL_NONE) return false;
  const r = Math.floor(slot / WALL_SIZE);
  const c = slot % WALL_SIZE;
  if (kind === 'H') return !hasWall(walls, r, c - 1, 'H') && !hasWall(walls, r, c + 1, 'H');
  return !hasWall(walls, r - 1, c, 'V') && !hasWall(walls, r + 1, c, 'V');
}

export function placeWall(walls: string, slot: number, kind: WallKind): string {
  return walls.slice(0, slot) + kind + walls.slice(slot + 1);
}

function orthogonalNeighbors(walls: string, cell: number): number[] {
  const out: number[] = [];
  const r = row(cell);
  const c = col(cell);
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBoard(nr, nc)) continue;
    const next = cellOf(nr, nc);
    if (!blocked(walls, cell, next)) out.push(next);
  }
  return out;
}

/** 목표 줄까지 최소 몇 칸(벽만 보고 상대 말은 무시) — 길이 없으면 -1 */
export function distance(walls: string, pawn: number, goalRow: number): number {
  if (row(pawn) === goalRow) return 0;
  const dist = Array<number>(CELLS).fill(-1);
  dist[pawn] = 0;
  const queue = [pawn];
  for (let head = 0; head < queue.length; head += 1) {
    const cur = queue[head];
    for (const next of orthogonalNeighbors(walls, cur)) {
      if (dist[next] >= 0) continue;
      dist[next] = dist[cur] + 1;
      if (row(next) === goalRow) return dist[next];
      queue.push(next);
    }
  }
  return -1;
}

export function hasPath(walls: string, pawn: number, goalRow: number): boolean {
  return distance(walls, pawn, goalRow) >= 0;
}

/** 놓은 뒤에도 두 말 모두 제 목표 줄에 닿을 수 있는가 — 막는 것은 되고 가두는 것은 안 된다 */
export function wallKeepsBothPaths(
  walls: string, slot: number, kind: WallKind, pawnA: number, goalA: number, pawnB: number, goalB: number,
): boolean {
  const next = placeWall(walls, slot, kind);
  return hasPath(next, pawnA, goalA) && hasPath(next, pawnB, goalB);
}

/**
 * 지금 갈 수 있는 칸 — 오름차순. 맞붙은 상대는 뛰어넘고, 넘어갈 자리가 판 밖이거나 벽이면 대각선 두 자리로
 * 비껴간다(막히지 않은 쪽 모두 — 서버와 같은 표준 규칙).
 */
export function legalMoves(walls: string, me: number, opponent: number): number[] {
  const out: number[] = [];
  const r = row(me);
  const c = col(me);
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBoard(nr, nc)) continue;
    const next = cellOf(nr, nc);
    if (blocked(walls, me, next)) continue;
    if (next !== opponent) {
      out.push(next);
      continue;
    }
    const jr = nr + dr;
    const jc = nc + dc;
    if (inBoard(jr, jc) && !blocked(walls, next, cellOf(jr, jc))) {
      out.push(cellOf(jr, jc));
      continue;
    }
    const sides = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [sr0, sc0] of sides) {
      const sr = nr + sr0;
      const sc = nc + sc0;
      if (!inBoard(sr, sc)) continue;
      const side = cellOf(sr, sc);
      if (!blocked(walls, next, side)) out.push(side);
    }
  }
  return out.sort((a, b) => a - b);
}

/** 시작 칸 — 제 목표 줄의 반대편 가운데 */
export function startCell(goalRow: number): number {
  return cellOf(goalRow === 0 ? SIZE - 1 : 0, Math.floor(SIZE / 2));
}

export interface IllegalWall {
  slot: number;
  kind: WallKind;
  reason: 'OVERLAP' | 'BLOCKS_PATH';
}

/** 지금 판에서 놓을 수 없는 벽 자리 전부 — 서버 WallRaceGame.illegalWalls 와 같은 두 검사 */
export function illegalWalls(walls: string, pawnA: number, goalA: number, pawnB: number, goalB: number): IllegalWall[] {
  const out: IllegalWall[] = [];
  for (let slot = 0; slot < WALL_SLOTS; slot += 1) {
    for (const kind of ['H', 'V'] as const) {
      if (!canPlaceWall(walls, slot, kind)) out.push({ slot, kind, reason: 'OVERLAP' });
      else if (!wallKeepsBothPaths(walls, slot, kind, pawnA, goalA, pawnB, goalB)) out.push({ slot, kind, reason: 'BLOCKS_PATH' });
    }
  }
  return out;
}

export function isLegalWall(walls: string, slot: number, kind: WallKind, pawnA: number, goalA: number, pawnB: number, goalB: number): boolean {
  return canPlaceWall(walls, slot, kind) && wallKeepsBothPaths(walls, slot, kind, pawnA, goalA, pawnB, goalB);
}

export const cellName = (cell: number) => `${row(cell) + 1}행 ${col(cell) + 1}열`;
