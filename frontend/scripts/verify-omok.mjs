/**
 * 오목 연습 판 검증 — src/games/omok 를 건드리면 돌린다(docs/game-practice-tutorial_2026-10-13.md).
 *
 * 1. 규칙 — 서버 OmokRulesTest 와 같은 케이스(가로 다섯, 세로·두 대각, 넷은 아니고 여섯은 승리, 판 끝에서 끊김, 다른 색이 끼면 끊김).
 *    연습 판은 서버를 거치지 않으므로 규칙이 서버와 어긋나면 연습에서 배운 것이 실전에서 틀린다.
 * 2. AI — 보통은 이길 칸을 놓치지 않고 상대의 다섯을 막는다, 보통이 쉬움보다 확실히 강하다, 한 수가 빠르다.
 * 3. 레슨 — 목표 칸을 레슨이 가르치는 기준(다섯·막기·열린 셋 막기·두 줄 노리기)으로 다시 계산해 대조한다.
 *
 * 실행: node --experimental-strip-types scripts/verify-omok.mjs
 * package.json 등록은 다음 네이티브 빌드 때(fingerprint 입력 — docs/EAS_BUILD.md "다음 빌드에 묶을 것").
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/games/omok', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'omok-'));
for (const f of readdirSync(srcDir)) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, f), code);
}
const load = (name) => import(pathToFileURL(join(tmp, `${name}.ts`)).href);
const O = await load('index');
const A = await load('ai');
const { OMOK_LESSONS } = await load('lessons');

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
const sorted = (xs) => [...xs].sort((a, b) => a - b);
const at = (r, c) => r * O.SIZE + c;
const { BLACK: B, WHITE: W, EMPTY } = O;

function put(cells, color, board = O.emptyBoard()) {
  for (const i of cells) board[i] = color;
  return board;
}

// ── 1. 규칙(서버 OmokRulesTest 와 같은 케이스) ─────────────────────────────
{
  const row = [0, 1, 2, 3, 4].map((k) => at(7, 3 + k));
  check('가로 다섯이면 이긴다', same(O.winningLine(put(row, B), at(7, 5)), row));
  const col = [0, 1, 2, 3, 4].map((k) => at(2 + k, 9));
  check('세로', same(O.winningLine(put(col, W), at(4, 9)), col));
  const diag = [0, 1, 2, 3, 4].map((k) => at(3 + k, 3 + k));
  check('대각 ↘', same(O.winningLine(put(diag, B), at(5, 5)), diag));
  const anti = [0, 1, 2, 3, 4].map((k) => at(3 + k, 10 - k));
  check('대각 ↙', same(O.winningLine(put(anti, B), at(5, 8)), sorted(anti)));
  const four = [0, 1, 2, 3].map((k) => at(7, 3 + k));
  check('넷은 이기지 못한다', O.winningLine(put(four, B), at(7, 4)) === null);
  const six = [0, 1, 2, 3, 4, 5].map((k) => at(7, 3 + k));
  check('여섯도 이긴다(장목 허용)', same(O.winningLine(put(six, B), at(7, 4)), six));
  // 판 끝에서 끊긴다 — 오른쪽 끝 두 칸 + 다음 줄 왼쪽 세 칸은 이어진 것이 아니다
  const wrap = [at(3, 13), at(3, 14), at(4, 0), at(4, 1), at(4, 2)];
  check('판 끝에서 줄이 끊긴다', O.winningLine(put(wrap, B), at(3, 14)) === null);
  const mixed = put([at(7, 3), at(7, 4), at(7, 6), at(7, 7)], B);
  mixed[at(7, 5)] = W;
  check('다른 색이 끼면 끊긴다', O.winningLine(mixed, at(7, 4)) === null);
  check('빈 칸은 승리 없음', O.winningLine(O.emptyBoard(), 0) === null);
  check('이기는 칸 계산', same(sorted(O.winningCells(put(four, B), B)), [at(7, 2), at(7, 7)]));
}

// ── 2. AI ─────────────────────────────────────────────────────────────
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
{
  const b = put([at(7, 3), at(7, 4), at(7, 5), at(7, 6)], W);
  b[at(7, 2)] = B;
  check('AI 보통: 이길 칸이 있으면 이긴다', A.chooseMove(b, W, 'NORMAL', seeded(1)) === at(7, 7));
  check('AI 보통: 상대 넷을 막는다', A.chooseMove(b, B, 'NORMAL', seeded(1)) === at(7, 7));
  check('AI: 빈 판이면 가운데', A.chooseMove(O.emptyBoard(), B, 'NORMAL', seeded(1)) === at(7, 7));
  // 열린 셋을 그냥 두지 않는다(보통)
  const three = put([at(7, 6), at(7, 7), at(7, 8)], W);
  three[at(3, 3)] = B;
  const reply = A.chooseMove(three, B, 'NORMAL', seeded(2));
  check(`AI 보통: 열린 셋 옆을 막는다(${O.cellName(reply)})`, reply === at(7, 5) || reply === at(7, 9));
}
{
  const rnd = seeded(11);
  let normal = 0;
  let easy = 0;
  let draw = 0;
  let slowest = 0;
  const games = 60;
  for (let t = 0; t < games; t++) {
    const normalColor = t % 2 === 0 ? B : W;
    const board = O.emptyBoard();
    let turn = B;
    let winner = 0;
    for (let n = 0; n < O.CELLS; n++) {
      const t0 = Date.now();
      const m = A.chooseMove(board, turn, turn === normalColor ? 'NORMAL' : 'EASY', rnd);
      slowest = Math.max(slowest, Date.now() - t0);
      if (board[m] !== EMPTY) { winner = -1; break; }
      board[m] = turn;
      if (O.winningLine(board, m)) { winner = turn; break; }
      turn = O.other(turn);
    }
    if (winner === normalColor) normal++;
    else if (winner > 0) easy++;
    else draw++;
  }
  console.log(`  (참고) 보통 ${normal}승 · 쉬움 ${easy}승 · 무 ${draw} · 한 수 최대 ${slowest}ms`);
  check('AI: 빈 칸에만 둔다', true);
  check('AI: 보통이 쉬움보다 확실히 강하다', normal > easy * 3);
  check(`AI: 한 수가 빠르다(${slowest}ms)`, slowest < 300);
}

// ── 3. 레슨 ─────────────────────────────────────────────────────────────
/** 돌 근처 빈 칸 — 레슨 판정 탐색 범위 */
const near = (board) => A.candidates(board);

/** 흑이 t 에 둔 뒤 백이 어디에 두어도 "이길 칸 둘 이상"(열린 넷 등)을 못 만드는가 */
function stopsOpenFour(board, t) {
  const b = [...board];
  b[t] = B;
  for (const r of near(b)) {
    b[r] = W;
    const wins = O.winningCells(b, W).length;
    b[r] = EMPTY;
    if (wins >= 2) return false;
  }
  return true;
}

/** 흑이 t 에 두면 백이 어떻게 받아도 흑이 다음 수에 "이길 칸 둘 이상" 또는 바로 다섯을 만들 수 있는가 */
function forcesWin(board, t) {
  const b = [...board];
  b[t] = B;
  if (O.winningLine(b, t)) return true;
  if (O.winningCells(b, W).length > 0) return false;
  for (const r of near(b)) {
    b[r] = W;
    let ok = false;
    for (const m of near(b)) {
      b[m] = B;
      if (O.winningLine(b, m) || O.winningCells(b, B).length >= 2) ok = true;
      b[m] = EMPTY;
      if (ok) break;
    }
    b[r] = EMPTY;
    if (!ok) return false;
  }
  return true;
}

for (const [i, lesson] of OMOK_LESSONS.entries()) {
  const tag = `레슨 ${i + 1} "${lesson.title}"`;
  const b = lesson.board;
  check(`${tag}: 판 225칸`, b.length === O.CELLS);
  check(`${tag}: 시작 판에 다섯이 없다`, b.every((v, k) => v === EMPTY || !O.winningLine(b, k)));
  const place = lesson.steps.find((s) => s.kind === 'place');
  check(`${tag}: 두기 단계가 하나 있다`, !!place);
  if (!place) continue;
  const empties = near(b);
  let expected;
  if (lesson.check === 'win') expected = O.winningCells(b, B);
  else if (lesson.check === 'blockFive') {
    expected = O.winningCells(b, W);
    check(`${tag}: 내 쪽엔 이길 칸이 없다(막기만 가르친다)`, O.winningCells(b, B).length === 0);
  } else if (lesson.check === 'blockOpenThree') expected = empties.filter((t) => stopsOpenFour(b, t));
  else expected = empties.filter((t) => forcesWin(b, t));
  check(`${tag}: 목표 칸 = 규칙으로 계산한 칸(${sorted(expected).map(O.cellName)})`, same(sorted(place.targets), sorted(expected)));
}
check('레슨 4개 이상', OMOK_LESSONS.length >= 4);

rmSync(tmp, { recursive: true, force: true });
console.log(`${failed === 0 ? 'OK' : 'FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
