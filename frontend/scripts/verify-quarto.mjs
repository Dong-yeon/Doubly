/**
 * 넷이 같아 미리보기 판정 검증 — src/games/quarto 를 건드리면 돌린다.
 *
 * 서버의 QuartoRulesTest 와 <b>같은 케이스</b>다: 줄 10개 × 속성 4개 × 값 0/1, 공통 속성이 없는 네 말,
 * 셋만 찬 줄, 무승부 배치, 15번째 놓기 뒤 남는 한 말. 앱의 [놓고 승리] 판단이 서버 판정과 어긋나면
 * 이기는 수에 give 를 실어 보내 거절(QUARTO_GIVE_ON_WIN)되거나, 이길 수를 보통 수로 보내 서버가 대신 이긴다.
 *
 * 실행: node --experimental-strip-types scripts/verify-quarto.mjs
 *
 * package.json 에 아직 등록하지 않았다 — npm scripts 는 EAS fingerprint 입력이라 등록하는 순간 main 에서 올리는
 * 모든 업데이트가 지금 앱에 안 간다. 다음 네이티브 빌드 때 함께 등록한다(docs/EAS_BUILD.md "다음 빌드에 묶을 것").
 *
 * 연습 판(docs/game-practice-tutorial_2026-10-13.md)의 엔진(local.ts)·AI(ai.ts)·튜토리얼 레슨(lessons.ts)도 함께 본다.
 * 모듈끼리 확장자 없이 import 하므로 verify-puyo 와 같이 임시 폴더에 복사하며 .ts 를 붙인다.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/games/quarto', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'quarto-'));
for (const f of readdirSync(srcDir)) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, f), code);
}
const load = (name) => import(pathToFileURL(join(tmp, `${name}.ts`)).href);
const Q = await load('index');
const L = await load('local');
const A = await load('ai');
const { QUARTO_LESSONS } = await load('lessons');

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
const empty = () => Array(16).fill(Q.EMPTY);

/** 비트 bit 만 value 로 같고 나머지 세 비트는 섞인 말 넷 — 서버 QuartoRulesTest.onlyCommon 과 같다 */
function onlyCommon(bit, value) {
  const others = [0b000, 0b111, 0b011, 0b100];
  return others.map((o) => {
    const low = o & ((1 << bit) - 1);
    const high = (o >> bit) << (bit + 1);
    return high | (value << bit) | low;
  });
}
const NO_COMMON = [0b0000, 0b1111, 0b0011, 0b1100];
const DRAW = [0, 1, 2, 12, 3, 4, 5, 8, 6, 9, 10, 15, 11, 14, 13, 7];

// 1. 줄 10개 × 속성 4개 × 값 0/1
check('줄은 10개', Q.LINES.length === 10);
let cases = 0;
for (const line of Q.LINES) {
  for (let bit = 0; bit < 4; bit++) {
    for (let value = 0; value <= 1; value++) {
      const p = onlyCommon(bit, value);
      const all1 = p[0] & p[1] & p[2] & p[3];
      const all0 = ~p[0] & ~p[1] & ~p[2] & ~p[3] & 0xf;
      check(`만든 말이 속성 ${bit} 하나만 같다`, new Set(p).size === 4 && (all1 | all0) === 1 << bit);
      const board = empty();
      line.forEach((c, i) => { board[c] = p[i]; });
      for (const cell of line) {
        check(`줄 ${line} 비트 ${bit}=${value} 칸 ${cell}`, same(Q.winningLineThrough(board, cell), [...line]));
      }
      // 마지막 칸을 미리보기로 놓아도 같은 줄
      const before = [...board];
      before[line[3]] = Q.EMPTY;
      check(`미리보기 승리 ${line} ${bit}=${value}`, same(Q.previewPlace(before, line[3], p[3]).winLine, [...line]));
      // 이긴 줄 설명에는 그 속성 하나만 나온다
      check(`공통 속성 문구 ${bit}=${value}`, Q.commonTraitLabels(p).length === 1);
      cases++;
    }
  }
}
check('80 케이스', cases === 80);

// 2. 공통 속성이 없는 네 말
check('공통 없음', !Q.sharesTrait(...NO_COMMON));
check('공통 없음 문구 비어 있음', Q.commonTraitLabels(NO_COMMON).length === 0);
for (const line of Q.LINES) {
  const board = empty();
  line.forEach((c, i) => { board[c] = NO_COMMON[i]; });
  for (const cell of line) check(`공통 없는 줄 ${line} 칸 ${cell}`, Q.winningLineThrough(board, cell) === null);
}

// 3. 셋만 찬 줄
for (const line of Q.LINES) {
  const board = empty();
  const p = onlyCommon(2, 0);
  for (let i = 0; i < 3; i++) board[line[i]] = p[i];
  check(`셋만 찬 줄 ${line}`, Q.winningLineThrough(board, line[0]) === null);
}

// 4. 놓은 칸을 지나지 않는 줄은 보지 않는다
{
  const board = empty();
  onlyCommon(0, 1).forEach((p, i) => { board[i] = p; });
  check('놓은 칸 밖의 줄은 무시', Q.winningLineThrough(board, 5) === null);
}

// 5. 무승부 배치 — 칸 순서대로 놓아도 어느 수에서도 이기지 않고, 15번째 뒤엔 한 말, 16번째 뒤엔 0
{
  let board = empty();
  let ok = true;
  for (let k = 0; k < 16; k++) {
    const pv = Q.previewPlace(board, k, DRAW[k]);
    if (pv.winLine) ok = false;
    if (k === 14) check('15번째 놓기 뒤 남은 말 하나', same(pv.remainingAfter, [DRAW[15]]));
    if (k === 15) check('16번째 놓기 뒤 남은 말 없음', pv.remainingAfter.length === 0);
    board = pv.board;
  }
  check('무승부 배치는 어느 수에서도 이기지 않는다', ok);
}

// 6. 남은 말·말 설명
check('남은 말 계산', Q.remainingPieces([0, ...Array(15).fill(Q.EMPTY)], 3).length === 14);
check('말 설명', Q.describePiece(0) === '잉크색 큰 둥근 꽉 찬 말' && Q.describePiece(15) === '호박색 작은 네모난 구멍 난 말');
check('공통 여러 개', same(Q.commonTraitLabels([0, 1, 0, 1]), ['모두 둥근 말', '모두 큰 말', '모두 꽉 찬 말']));

// ── 연습 판 엔진(local.ts) — 서버 QuartoGame.apply 와 같은 규칙 ─────────────────
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
{
  // 무승부 배치를 칸 순서대로 — AI 가 먼저 준다(0 번째 = AI)
  let g = L.newLocalGame('AI');
  g = L.applyLocal(g, 'AI', null, DRAW[0]);
  check('엔진: 첫 수 뒤 받은 말', g.pending === DRAW[0] && L.turnOf(g) === 'ME');
  for (let k = 1; k <= 16; k++) {
    const side = L.turnOf(g);
    g = L.applyLocal(g, side, k - 1, k < 15 ? DRAW[k] : null);
  }
  check('엔진: 16번째에 무승부', g.winner === 'DRAW' && g.winLine === null && g.moveNo === 17);
  check('엔진: 15번째 뒤 마지막 말은 저절로', g.history[15].give === DRAW[15]);
  check('엔진: 끝난 판엔 못 둔다', throws(() => L.applyLocal(g, L.turnOf(g), 0, null)));
}
{
  const p = onlyCommon(2, 1);
  let g = L.newLocalGame('AI');
  check('엔진: 차례 아님 거절', throws(() => L.applyLocal(g, 'ME', null, 1)));
  check('엔진: 첫 수에 place 거절', throws(() => L.applyLocal(g, 'AI', 0, 1)));
  g = L.applyLocal(g, 'AI', null, p[0]);
  g = L.applyLocal(g, 'ME', 0, p[1]);
  g = L.applyLocal(g, 'AI', 1, p[2]);
  g = L.applyLocal(g, 'ME', 2, p[3]);
  check('엔진: 채워진 칸 거절', throws(() => L.applyLocal(g, 'AI', 0, 5)));
  check('엔진: 이기는 수에 give 거절', throws(() => L.applyLocal(g, 'AI', 3, 5)));
  check('엔진: 판에 있는 말 건네기 거절', throws(() => L.applyLocal(g, 'AI', 4, p[0])));
  const won = L.applyLocal(g, 'AI', 3, null);
  check('엔진: 놓은 쪽이 이긴다', won.winner === 'AI' && same(won.winLine, [0, 1, 2, 3]));
}

// ── AI ─────────────────────────────────────────────────────────────────
/** 시드 고정 난수 — 결과가 재현되게 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
{
  // 보통: 이길 칸이 있으면 반드시 이긴다(80 케이스 판을 그대로 쓴다)
  let ok = true;
  for (const line of Q.LINES) {
    for (let bit = 0; bit < 4; bit++) {
      const p = onlyCommon(bit, 1);
      const board = empty();
      for (let i = 0; i < 3; i++) board[line[i]] = p[i];
      const m = A.chooseMove(board, p[3], 'NORMAL', seeded(bit + 7));
      if (m.give !== null || !Q.winningLineThrough([...board.slice(0, m.place), p[3], ...board.slice(m.place + 1)], m.place)) ok = false;
    }
  }
  check('AI 보통: 이길 수 있으면 이긴다', ok);
}
{
  // 보통: 안전한 말이 있으면 위험한 말을 건네지 않는다 — 무작위 판 300개
  const rnd = seeded(42);
  let violations = 0;
  let checked = 0;
  for (let t = 0; t < 300; t++) {
    let g = L.newLocalGame('ME');
    g = L.applyLocal(g, 'ME', null, Math.floor(rnd() * 16));
    while (!g.winner) {
      const side = L.turnOf(g);
      const level = side === 'AI' ? 'NORMAL' : 'EASY';
      const m = A.chooseMove(g.board, g.pending, level, rnd);
      if (side === 'AI' && m.give != null) {
        const after = [...g.board];
        after[m.place] = g.pending;
        const left = Q.remainingPieces(after, null);
        const anySafe = left.some((x) => A.isSafeGive(after, x));
        checked++;
        if (anySafe && !A.isSafeGive(after, m.give)) violations++;
      }
      g = L.applyLocal(g, side, m.place, m.give);
    }
  }
  check(`AI 보통: 안전한 말이 있으면 위험한 말을 주지 않는다(${checked}수)`, violations === 0 && checked > 0);
}
{
  // 보통 vs 쉬움 — 보통이 확실히 더 많이 이겨야 단계 구분이 의미 있다
  const rnd = seeded(7);
  let normalWins = 0;
  let easyWins = 0;
  for (let t = 0; t < 200; t++) {
    const normalSide = t % 2 === 0 ? 'AI' : 'ME';
    let g = L.newLocalGame(t % 4 < 2 ? 'ME' : 'AI');
    g = L.applyLocal(g, g.first, null, A.chooseFirstGive(rnd));
    while (!g.winner) {
      const side = L.turnOf(g);
      const m = A.chooseMove(g.board, g.pending, side === normalSide ? 'NORMAL' : 'EASY', rnd);
      g = L.applyLocal(g, side, m.place, m.give);
    }
    if (g.winner === normalSide) normalWins++;
    else if (g.winner !== 'DRAW') easyWins++;
  }
  console.log(`  (참고) 보통 ${normalWins}승 · 쉬움 ${easyWins}승 · 무 ${200 - normalWins - easyWins}`);
  check('AI: 보통이 쉬움보다 확실히 강하다', normalWins > easyWins * 3);
}
{
  // 끝판 탐색이 오래 걸리지 않는다 — 빈 칸 6개에서 한 수
  const board = [...DRAW];
  for (const c of [3, 6, 9, 12, 14, 15]) board[c] = Q.EMPTY;
  const t0 = Date.now();
  A.chooseMove(board, DRAW[3], 'NORMAL', seeded(1));
  const ms = Date.now() - t0;
  check(`AI 끝판 탐색 속도(${ms}ms)`, ms < 1500);
}

// ── 튜토리얼 레슨 — 데이터가 규칙과 맞는가 ─────────────────────────────
for (const [i, lesson] of QUARTO_LESSONS.entries()) {
  const tag = `레슨 ${i + 1} "${lesson.title}"`;
  const pieces = lesson.board.filter((p) => p !== Q.EMPTY);
  check(`${tag}: 판 16칸`, lesson.board.length === 16);
  check(`${tag}: 말이 겹치지 않는다`, new Set([...pieces, ...(lesson.pending == null ? [] : [lesson.pending])]).size === pieces.length + (lesson.pending == null ? 0 : 1));
  check(`${tag}: 시작 판에 이미 이긴 줄이 없다`, lesson.board.every((p, c) => p === Q.EMPTY || !Q.winningLineThrough(lesson.board, c)));
  for (const step of lesson.steps) {
    if (step.kind === 'place') {
      check(`${tag}: 놓기 단계엔 받은 말이 있다`, lesson.pending != null);
      if (Array.isArray(step.targets)) {
        const wins = A.winningCells(lesson.board, lesson.pending);
        check(`${tag}: 목표 칸 = 이기는 칸 전부(${wins})`, same([...wins].sort((a, b) => a - b), [...step.targets].sort((a, b) => a - b)));
      }
    }
    if (step.kind === 'give' && step.rule === 'safe') {
      const left = Q.remainingPieces(lesson.board, null);
      const safe = left.filter((p) => A.isSafeGive(lesson.board, p));
      check(`${tag}: 안전한 말과 위험한 말이 둘 다 있다(${safe.length}/${left.length})`, safe.length > 0 && safe.length < left.length);
    }
  }
}
check('레슨 4개 이상', QUARTO_LESSONS.length >= 4);

rmSync(tmp, { recursive: true, force: true });
console.log(`${failed === 0 ? 'OK' : 'FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
