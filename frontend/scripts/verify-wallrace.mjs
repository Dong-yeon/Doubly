/**
 * 길막기 연습 판 검증 — src/games/wallrace 를 건드리면 돌린다(docs/game-practice-tutorial_2026-10-13.md).
 *
 * 1. 규칙 — 서버 WallRaceRulesTest 의 케이스를 그대로(벽이 막는 통로·가장자리·겹침·경로 존재·가두는 벽·이동·점프·대각선).
 *    연습은 서버를 거치지 않으므로 앱 규칙이 서버와 어긋나면 연습에서 배운 게 실전에서 거절된다.
 * 2. AI — 도착할 수 있으면 간다, 지고 있으면 벽을 놓는다, 늘 합법 수만, 보통이 쉬움보다 강하다, 빠르다.
 * 3. 레슨 — 목표 칸이 갈 수 있는 칸인가, "느리게 하는 벽"이 실제로 있는가, 마지막 레슨에 정말 못 놓는 벽이 있는가.
 *
 * 실행: node --experimental-strip-types scripts/verify-wallrace.mjs
 * package.json 등록은 다음 네이티브 빌드 때(fingerprint 입력 — docs/EAS_BUILD.md "다음 빌드에 묶을 것").
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/games/wallrace', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'wallrace-'));
for (const f of readdirSync(srcDir)) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, f), code);
}
const load = (name) => import(pathToFileURL(join(tmp, `${name}.ts`)).href);
const R = await load('index');
const L = await load('local');
const A = await load('ai');
const { WALL_LESSONS } = await load('lessons');

let failed = 0;
let passed = 0;
const check = (name, cond) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}`);
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const at = (r, c) => R.cellOf(r, c);
const slot = (r, c) => r * R.WALL_SIZE + c;
const wall = (r, c, k) => R.placeWall(R.emptyWalls(), slot(r, c), k);
const put = (w, r, c, k) => R.placeWall(w, slot(r, c), k);

// ── 1. 규칙(서버 WallRaceRulesTest 와 같은 케이스) ─────────────────────────
{
  const w = wall(4, 3, 'H');
  check('가로 벽: 위아래 두 통로', R.blocked(w, at(4, 3), at(5, 3)) && R.blocked(w, at(4, 4), at(5, 4)));
  check('가로 벽: 양옆은 열림', !R.blocked(w, at(4, 2), at(5, 2)) && !R.blocked(w, at(4, 5), at(5, 5)));
  check('가로 벽: 좌우 통행은 안 막음', !R.blocked(w, at(4, 3), at(4, 4)));
}
{
  const w = wall(4, 3, 'V');
  check('세로 벽: 좌우 두 통로', R.blocked(w, at(4, 3), at(4, 4)) && R.blocked(w, at(5, 3), at(5, 4)));
  check('세로 벽: 위아래 칸은 열림', !R.blocked(w, at(3, 3), at(3, 4)) && !R.blocked(w, at(6, 3), at(6, 4)));
  check('세로 벽: 위아래 통행은 안 막음', !R.blocked(w, at(4, 3), at(5, 3)));
}
check('가장자리 통로도 막힌다',
  R.blocked(wall(4, 0, 'H'), at(4, 0), at(5, 0)) && R.blocked(wall(4, 7, 'H'), at(4, 8), at(5, 8))
  && R.blocked(wall(0, 4, 'V'), at(0, 4), at(0, 5)) && R.blocked(wall(7, 4, 'V'), at(8, 4), at(8, 5)));
{
  const w = R.emptyWalls();
  let open = w.length === R.WALL_SLOTS;
  for (let cell = 0; cell < R.CELLS; cell++) {
    const r = R.row(cell);
    const c = R.col(cell);
    if (r + 1 < R.SIZE && R.blocked(w, cell, at(r + 1, c))) open = false;
    if (c + 1 < R.SIZE && R.blocked(w, cell, at(r, c + 1))) open = false;
  }
  check('빈 판은 아무 통로도 안 막힘', open);
}
{
  const w = wall(4, 3, 'H');
  check('같은 교차점엔 못 놓음(교차 포함)', !R.canPlaceWall(w, slot(4, 3), 'H') && !R.canPlaceWall(w, slot(4, 3), 'V'));
  check('가로 벽은 좌우로 붙은 가로 벽과 겹친다', !R.canPlaceWall(w, slot(4, 2), 'H') && !R.canPlaceWall(w, slot(4, 4), 'H'));
  check('한 칸 떨어지면 괜찮다', R.canPlaceWall(w, slot(4, 1), 'H') && R.canPlaceWall(w, slot(4, 5), 'H'));
  check('위아래로 붙은 가로 벽·옆 세로 벽은 괜찮다',
    R.canPlaceWall(w, slot(3, 3), 'H') && R.canPlaceWall(w, slot(4, 2), 'V') && R.canPlaceWall(w, slot(4, 4), 'V'));
}
{
  const w = wall(4, 3, 'V');
  check('세로 벽은 위아래로 붙은 세로 벽과 겹친다', !R.canPlaceWall(w, slot(3, 3), 'V') && !R.canPlaceWall(w, slot(5, 3), 'V'));
  check('세로: 떨어지거나 다른 방향은 괜찮다',
    R.canPlaceWall(w, slot(2, 3), 'V') && R.canPlaceWall(w, slot(4, 2), 'V') && R.canPlaceWall(w, slot(3, 3), 'H'));
}
{
  const w = R.emptyWalls();
  check('판 밖·엉뚱한 종류 거절',
    !R.canPlaceWall(w, -1, 'H') && !R.canPlaceWall(w, R.WALL_SLOTS, 'H') && !R.canPlaceWall(w, 0, '0') && !R.canPlaceWall(w, 0, 'X'));
  check('벽 없으면 어디서든 닿는다', R.hasPath(w, at(8, 4), 0) && R.hasPath(w, at(0, 4), 8) && R.hasPath(w, at(0, 0), 0));
}
{
  const trapped = put(wall(0, 0, 'H'), 0, 1, 'V');
  check('두 벽으로 구석에 갇힌다', !R.hasPath(trapped, at(0, 0), 8) && !R.hasPath(trapped, at(0, 1), 8));
  check('나머지는 멀쩡하다', R.hasPath(trapped, at(0, 2), 8) && R.hasPath(trapped, at(8, 4), 0));
}
{
  let w = R.emptyWalls();
  let ok = true;
  for (let c = 0; c <= 6; c += 2) {
    if (!R.canPlaceWall(w, slot(0, c), 'H')) ok = false;
    w = put(w, 0, c, 'H');
  }
  check('가로줄을 가로 벽만으로 완전히 막을 수 없다',
    ok && !R.canPlaceWall(w, slot(0, 7), 'H') && !R.blocked(w, at(0, 8), at(1, 8)) && R.hasPath(w, at(0, 4), 8));
}
{
  const w = wall(0, 0, 'H');
  const me = at(0, 0);
  const you = at(8, 4);
  check('가두는 벽은 겹침상 가능하지만', R.canPlaceWall(w, slot(0, 1), 'V'));
  check('제 말을 가두는 벽은 못 놓음', !R.wallKeepsBothPaths(w, slot(0, 1), 'V', me, 8, you, 0));
  check('상대 말을 가두는 벽도 못 놓음', !R.wallKeepsBothPaths(w, slot(0, 1), 'V', you, 0, me, 8));
  check('둘 다 길이 남으면 놓을 수 있음', R.wallKeepsBothPaths(R.emptyWalls(), slot(4, 4), 'H', at(8, 4), 0, at(0, 4), 8));
}
{
  const e = R.emptyWalls();
  check('한가운데 네 방향', same(R.legalMoves(e, at(4, 4), at(0, 0)), [at(3, 4), at(4, 3), at(4, 5), at(5, 4)]));
  check('시작 칸', R.startCell(0) === at(8, 4) && R.startCell(8) === at(0, 4));
  check('시작 칸에선 판 밖으로 못 감', same(R.legalMoves(e, at(8, 4), at(0, 4)), [at(7, 4), at(8, 3), at(8, 5)]));
  check('맞붙은 상대는 뛰어넘는다', same(R.legalMoves(e, at(4, 4), at(3, 4)), [at(2, 4), at(4, 3), at(4, 5), at(5, 4)]));
  check('넘어갈 자리 뒤 벽이면 대각선 양쪽',
    same(R.legalMoves(wall(2, 4, 'H'), at(4, 4), at(3, 4)), [at(3, 3), at(3, 5), at(4, 3), at(4, 5), at(5, 4)]));
  check('판 끝에 몰린 상대도 대각선',
    same(R.legalMoves(e, at(1, 4), at(0, 4)), [at(0, 3), at(0, 5), at(1, 3), at(1, 5), at(2, 4)]));
  check('대각선 한쪽이 막히면 나머지만', same(R.legalMoves(wall(0, 3, 'V'), at(1, 4), at(0, 4)), [at(0, 5), at(1, 5), at(2, 4)]));
  check('벽에 막힌 방향으로는 못 감', same(R.legalMoves(wall(3, 4, 'H'), at(4, 4), at(0, 0)), [at(4, 3), at(4, 5), at(5, 4)]));
  check('거리', R.distance(e, at(8, 4), 0) === 8 && R.distance(wall(7, 4, 'H'), at(8, 4), 0) === 9);
}

// ── 2. AI ─────────────────────────────────────────────────────────────
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
{
  const g = { ...L.newWallGame(), ai: at(7, 4), turn: 'AI' };
  const m = A.chooseAiMove(g, 'NORMAL', seeded(1));
  check('AI: 도착할 수 있으면 간다', m.kind === 'move' && R.row(m.cell) === 8);
}
{
  // 나는 한 칸 남았고 AI 는 멀다 — 보통은 벽을 놓는다
  const g = { ...L.newWallGame(), me: at(1, 4), ai: at(0, 0), turn: 'AI' };
  const m = A.chooseAiMove(g, 'NORMAL', seeded(2));
  check('AI 보통: 지고 있으면 벽', m.kind === 'wall' && L.canWall(g, m.slot, m.wall));
}
{
  const rnd = seeded(5);
  let normal = 0;
  let easy = 0;
  let illegal = 0;
  let slowest = 0;
  const games = 40;
  for (let t = 0; t < games; t++) {
    // 'ME' 자리를 쉬움 AI 로, 'AI' 자리를 보통 AI 로 둔다(반대 판도 섞는다)
    const normalSide = t % 2 === 0 ? 'AI' : 'ME';
    let g = L.newWallGame();
    for (let n = 0; n < 400 && !g.winner; n++) {
      const side = g.turn;
      // ME 쪽을 AI 로 두려면 판을 뒤집어 본다 — 간단히, ME 차례는 판을 AI 시점으로 바꿔 고른다
      const view = side === 'AI' ? g : flip(g);
      const t0 = Date.now();
      const m = A.chooseAiMove(view, side === normalSide ? 'NORMAL' : 'EASY', rnd);
      slowest = Math.max(slowest, Date.now() - t0);
      try {
        if (m.kind === 'move') g = L.moveLocal(g, side, side === 'AI' ? m.cell : R.CELLS - 1 - m.cell);
        else g = L.wallLocal(g, side, side === 'AI' ? m.slot : R.WALL_SLOTS - 1 - m.slot, m.wall);
      } catch {
        illegal++;
        break;
      }
    }
    if (g.winner === normalSide) normal++;
    else if (g.winner) easy++;
  }
  console.log(`  (참고) 보통 ${normal}승 · 쉬움 ${easy}승 · 한 수 최대 ${slowest}ms`);
  check('AI: 늘 합법 수만 둔다', illegal === 0);
  check('AI: 보통이 쉬움보다 확실히 강하다', normal > easy * 2);
  check(`AI: 한 수가 빠르다(${slowest}ms)`, slowest < 400);
}

/** ME 시점 판을 AI 시점으로 — 판을 180° 돌리고 두 말·벽 수를 바꾼다(가로·세로 벽은 그대로, 자리만 63−s) */
function flip(g) {
  const walls = [...g.walls].reverse().join('');
  return {
    ...g,
    walls,
    me: R.CELLS - 1 - g.ai,
    ai: R.CELLS - 1 - g.me,
    meWalls: g.aiWalls,
    aiWalls: g.meWalls,
    turn: 'AI',
  };
}

// ── 3. 레슨 ─────────────────────────────────────────────────────────────
for (const [i, lesson] of WALL_LESSONS.entries()) {
  const tag = `레슨 ${i + 1} "${lesson.title}"`;
  const g = { ...L.newWallGame(), walls: lesson.walls, me: lesson.me, ai: lesson.ai };
  check(`${tag}: 두 말 모두 길이 있다`, R.hasPath(g.walls, g.me, L.ME_GOAL) && R.hasPath(g.walls, g.ai, L.AI_GOAL));
  for (const step of lesson.steps) {
    if (step.kind === 'move') {
      const legal = L.legalMovesOf(g, 'ME');
      check(`${tag}: 목표 칸은 갈 수 있는 칸`, step.targets.every((c) => legal.includes(c)));
      check(`${tag}: 목표 칸은 거리를 줄인다`, step.targets.every((c) => R.distance(g.walls, c, L.ME_GOAL) < R.distance(g.walls, g.me, L.ME_GOAL)));
    }
    if (step.kind === 'wall') {
      const now = R.distance(g.walls, g.ai, L.AI_GOAL);
      let slows = 0;
      for (let s = 0; s < R.WALL_SLOTS; s++) {
        for (const k of ['H', 'V']) {
          if (L.canWall(g, s, k) && A.wallEffect(g, s, k).ai > now) slows++;
        }
      }
      check(`${tag}: 상대를 느리게 하는 벽이 있다(${slows})`, slows > 0);
      if (step.hint) {
        check(`${tag}: 힌트 벽은 놓을 수 있고 상대를 늦춘다`,
          L.canWall(g, step.hint.slot, step.hint.wall) && A.wallEffect(g, step.hint.slot, step.hint.wall).ai > now);
      }
    }
  }
  if (lesson.showsBlockedPath) {
    const b = lesson.showsBlockedPath;
    check(`${tag}: 그 벽은 겹치지 않지만 길을 막아 못 놓는다`,
      R.canPlaceWall(g.walls, b.slot, b.wall) && !L.canWall(g, b.slot, b.wall));
  }
}
check('레슨 4개 이상', WALL_LESSONS.length >= 4);

rmSync(tmp, { recursive: true, force: true });
console.log(`${failed === 0 ? 'OK' : 'FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
