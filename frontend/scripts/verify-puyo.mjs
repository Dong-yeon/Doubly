/**
 * 연쇄 퍼즐 엔진 검증 — 규칙을 건드리면 반드시 돌린다.
 *
 * 프론트에는 테스트 러너가 없어서(CLAUDE.md 6절) 이 스크립트가 그 역할을 한다.
 * verify-spellcheck.mjs 와 같은 방식 — Node 22.6+ 의 타입 제거로 .ts 를 바로 불러오되,
 * Node ESM 은 확장자 없는 import 를 못 풀어서 임시 폴더에 복사하며 .ts 를 붙인다.
 *
 * 검사 목록은 docs/COUPLE_PUZZLE_BATTLE_2026-09-18.md §4-2 "남는 위험" 그대로다:
 *   1. 매치 제거 → 중력 → 재매치 순서(연쇄)
 *   2. 회전 킥 — 벽·바닥에 붙은 상태의 회전
 *   3. 방해 조각의 성질 — 매치하지 않고, 인접 색이 사라질 때 함께 사라진다
 *   4. 수(手) 기준 진행 — 방해는 다음 착지 뒤에, 연쇄가 난 수에는 들어오지 않는다
 * 여기에 상쇄(§2-3)·점수 공식·패배 판정·시드 결정론·문자열 인코딩을 더한다.
 *
 * 실행: npm run verify:puyo
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const srcDir = fileURLToPath(new URL('../src/games/puyo', import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'puyo-'));
for (const f of readdirSync(srcDir)) {
  const code = readFileSync(join(srcDir, f), 'utf8').replace(/from '\.\/(\w+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, f), code);
}
const E = await import(pathToFileURL(join(tmp, 'index.ts')));

const { WIDTH, HEIGHT, HIDDEN_ROWS, EMPTY, GARBAGE } = E;

let failures = 0;
let passes = 0;
function check(name, cond, detail = '') {
  if (cond) {
    passes++;
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name, actual, expected) {
  check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/**
 * 그림으로 판을 만든다 — 아래에서 위로 줄을 적는다(맨 마지막 줄이 바닥).
 * '.' 빈칸, '1'~'4' 색, 'G' 방해. 적지 않은 윗줄은 빈칸.
 */
function board(...rowsTopToBottom) {
  const b = E.emptyBoard();
  const offset = HEIGHT - rowsTopToBottom.length;
  rowsTopToBottom.forEach((line, i) => {
    for (let col = 0; col < WIDTH; col++) {
      const ch = line[col] ?? '.';
      const v = ch === '.' ? EMPTY : ch === 'G' ? GARBAGE : Number(ch);
      b[E.cellIndex(col, offset + i)] = v;
    }
  });
  return b;
}
function draw(b) {
  const lines = [];
  for (let row = 0; row < HEIGHT; row++) {
    let s = '';
    for (let col = 0; col < WIDTH; col++) {
      const v = b[E.cellIndex(col, row)];
      s += v === EMPTY ? '.' : v === GARBAGE ? 'G' : String(v);
    }
    lines.push(s);
  }
  return lines.join('\n');
}
function same(name, a, b) {
  check(name, E.encodeBoard(a) === E.encodeBoard(b), `\n${draw(a)}\n--- expected ---\n${draw(b)}`);
}

/* ─── 1. 중력·매치·연쇄 순서 ─── */
console.log('1. 매치 제거 → 중력 → 재매치');
{
  // 세로 1 네 개 → 사라지고, 그 위의 2 두 개가 떨어져 바닥의 2 두 개와 만나 2연쇄
  const b = board(
    '..2...',
    '..2...',
    '..1...',
    '..1...',
    '..1...',
    '..12..',
    '...2..',
  );
  const { board: after, steps } = E.resolveChains(b);
  eq('연쇄 수', steps.length, 2);
  eq('1연쇄 사라진 수', steps[0].cleared.length, 4);
  eq('2연쇄 사라진 수', steps[1].cleared.length, 4);
  same('끝난 판은 비어 있다', after, E.emptyBoard());
  // 순서가 뒤집히면(중력 먼저) 1과 2가 동시에 사라져 1연쇄가 된다 — 위 검사가 그걸 막는다
}
{
  // 떠 있는 조각은 첫 중력이 정리한다 — 가로 조각 착지 후 한쪽만 바닥에 닿는 경우
  const b = board(
    '.12...',
    '.1....',
    '.1....',
    '.1....',
  );
  const { board: after, steps } = E.resolveChains(b);
  eq('1이 4개라 사라진다', steps.length, 1);
  same('2는 바닥까지 떨어진다', after, board('..2...'));
}
{
  // 3개는 사라지지 않는다
  const { steps } = E.resolveChains(board('111...'));
  eq('3개는 매치가 아니다', steps.length, 0);
}
{
  // 숨은 줄(row 0)의 조각은 매치에 참여하지 않는다 — 13단 규칙
  const b = E.emptyBoard();
  for (let row = 0; row < 4; row++) b[E.cellIndex(0, row)] = 1;
  // 다른 열도 채워 중력으로 움직이지 않게 (열 0 은 바닥까지 채운다)
  for (let row = 4; row < HEIGHT; row++) b[E.cellIndex(0, row)] = 2 + (row % 2);
  const { steps } = E.resolveChains(b);
  eq('숨은 줄 포함 4개는 사라지지 않는다', steps.length, 0);
  eq('findGroups 도 같은 답', E.findGroups(b).length, 0);
}
{
  // 두 색이 동시에 사라지면 한 단계(1연쇄)다
  const b = board('1111..', '2222..');
  const { steps } = E.resolveChains(b);
  eq('동시 제거는 1연쇄', steps.length, 1);
  eq('사라진 색 조각 8', steps[0].coloredCleared, 8);
}

/* ─── 2. 회전 킥 ─── */
console.log('2. 회전 킥');
{
  const empty = E.emptyBoard();
  const p = { axis: 1, child: 2, col: 0, row: 5, rot: 0 };
  const left = E.rotatePiece(empty, p, -1); // 자식을 왼쪽(col -1)으로 → 벽
  check('왼쪽 벽에서 왼쪽으로 돌리면 축이 오른쪽으로 밀린다', left && left.col === 1 && left.rot === 3);
  const p2 = { ...p, col: WIDTH - 1 };
  const right = E.rotatePiece(empty, p2, 1); // 자식을 오른쪽(col 6)으로 → 벽
  check('오른쪽 벽에서 오른쪽으로 돌리면 축이 왼쪽으로 밀린다', right && right.col === WIDTH - 2 && right.rot === 1);
}
{
  // 바닥에서 아래로 돌리면 한 칸 떠오른다
  const empty = E.emptyBoard();
  const p = { axis: 1, child: 2, col: 2, row: HEIGHT - 1, rot: 1 }; // 가로, 바닥
  const down = E.rotatePiece(empty, p, 1); // rot 2 = 자식 아래 → 바닥 밖
  check('바닥에서 아래로 돌리면 축이 한 칸 올라간다', down && down.row === HEIGHT - 2 && down.rot === 2);
}
{
  // 양쪽이 다 막히면 회전을 거부한다
  const b = board('1.1...', '1.1...', '1.1...');
  const p = { axis: 2, child: 3, col: 1, row: HEIGHT - 2, rot: 0 };
  eq('좌우 다 막힌 세로 조각은 못 돌린다', E.rotatePiece(b, p, 1), null);
  eq('반대 방향도 못 돌린다', E.rotatePiece(b, p, -1), null);
}
{
  // 막힌 쪽으로 이동은 null, 반대쪽은 된다
  const empty = E.emptyBoard();
  const p = E.spawnPiece(1, 2);
  eq('왼쪽으로 3번 가면 벽', E.movePiece(empty, { ...p, col: 0 }, -1), null);
  check('오른쪽은 간다', E.movePiece(empty, p, 1)?.col === p.col + 1);
}

/* ─── 3. 방해 조각의 성질 ─── */
console.log('3. 방해 조각');
{
  // 방해 4개가 붙어도 사라지지 않는다
  const { steps } = E.resolveChains(board('GGGG..', 'GG....'));
  eq('방해끼리는 매치가 아니다', steps.length, 0);
}
{
  // 색 무리에 붙은 방해는 함께 사라지고, 안 붙은 방해는 남는다
  const b = board(
    'G.....',
    '1G...G',
    '1.....',
    '1G..G.',
    '1....G',
  );
  const { board: after, steps } = E.resolveChains(b);
  eq('1연쇄', steps.length, 1);
  eq('사라진 칸 = 색 4 + 인접 방해 3', steps[0].cleared.length, 7);
  eq('점수는 색 조각만 센다', steps[0].coloredCleared, 4);
  same('떨어져 있던 방해는 남고 중력으로 내려온다', after, board('.....G', '....GG'));
}
{
  // 방해 투입 — 6개면 한 줄 전부, 8개면 한 줄 + 무작위 2열
  const empty = E.emptyBoard();
  const six = E.dropGarbage(empty, E.seedRng(1), 6);
  same('6개는 바닥 한 줄', six.board, board('GGGGGG'));
  const eight = E.dropGarbage(board('..1...'), E.seedRng(1), 8);
  eq('8개는 8칸', eight.dropped.length, 8);
  const bottomRow = [0, 1, 2, 3, 4, 5].map((c) => eight.board[E.cellIndex(c, HEIGHT - 1)]);
  check('바닥 줄은 기존 조각 하나 빼고 전부 방해', bottomRow.filter((v) => v === GARBAGE).length === 5 && bottomRow[2] === 1);
  check('열 2 의 방해는 기존 조각 위에 놓인다', eight.board[E.cellIndex(2, HEIGHT - 2)] === GARBAGE);
  const other = E.dropGarbage(board('..1...'), E.seedRng(2), 8);
  check('같은 시드는 같은 자리, 다른 시드는(대개) 다른 자리', E.encodeBoard(E.dropGarbage(board('..1...'), E.seedRng(1), 8).board) === E.encodeBoard(eight.board) && other.dropped.length === 8);
}
{
  // 꽉 찬 열에 떨어진 방해는 사라진다(넘침)
  const b = E.emptyBoard();
  for (let row = 0; row < HEIGHT; row++) b[E.cellIndex(0, row)] = 1;
  const r = E.dropGarbage(b, E.seedRng(1), 6);
  eq('꽉 찬 열은 건너뛴다', r.dropped.length, 5);
}

/* ─── 점수 공식 (뿌요뿌요 통) ─── */
console.log('4. 점수·방해 환산');
{
  eq('4개 1연쇄 = 40', E.chainScore(1, 4, 1, [4]), 40);
  eq('4개 2연쇄 = 10×4×8 = 320', E.chainScore(2, 4, 1, [4]), 320);
  eq('2색 동시 4+4 1연쇄 = 10×8×3 = 240', E.chainScore(1, 8, 2, [4, 4]), 240);
  eq('5개 무리 1연쇄 = 10×5×2 = 100', E.chainScore(1, 5, 1, [5]), 100);
  eq('11개 무리 보너스 10 = 1100', E.chainScore(1, 11, 1, [11]), 1100);
  eq('환산: 40점은 방해 0, 이월 40', JSON.stringify(E.garbageFromScore(40, 0)), JSON.stringify({ garbage: 0, carry: 40 }));
  eq('환산: 360점은 방해 5, 이월 10', JSON.stringify(E.garbageFromScore(360, 0)), JSON.stringify({ garbage: 5, carry: 10 }));
  eq('이월이 더해진다: 40 + 이월 40 = 방해 1, 이월 10', JSON.stringify(E.garbageFromScore(40, 40)), JSON.stringify({ garbage: 1, carry: 10 }));
}

/* ─── 상쇄 ─── */
console.log('5. 상쇄');
{
  eq('대기 3, 생산 5 → 상쇄 3, 전송 2, 잔량 0', JSON.stringify(E.offsetGarbage(3, 5)), JSON.stringify({ pending: 0, sent: 2, offset: 3 }));
  eq('대기 8, 생산 5 → 상쇄 5, 전송 0, 잔량 3', JSON.stringify(E.offsetGarbage(8, 5)), JSON.stringify({ pending: 3, sent: 0, offset: 5 }));
  eq('대기 0 → 전부 전송', JSON.stringify(E.offsetGarbage(0, 5)), JSON.stringify({ pending: 0, sent: 5, offset: 0 }));
}

/* ─── 수(手) 기준 진행 + 착지 전체 흐름 ─── */
console.log('6. 착지 흐름(수 기준)');
{
  // 방해를 받고 연쇄 없이 착지하면 그 수 뒤에 판에 들어온다
  let s = E.createPlayer(7);
  s = E.receiveGarbage(s, 4);
  eq('받은 방해는 대기 큐로', s.pendingGarbage, 4);
  same('판에는 아직 없다', s.board, E.emptyBoard());
  const out = E.hardDrop(s);
  eq('착지 뒤 방해 4개 투입', out.garbageDropped.length, 4);
  eq('대기 큐는 비었다', out.state.pendingGarbage, 0);
  eq('수가 1 늘었다', out.state.moves, 1);
  check('다음 조각이 생성됐다', out.state.piece !== null && out.state.piece.col === E.SPAWN_COL);
}
{
  // 연쇄가 난 수에는 방해가 들어오지 않고 상쇄만 한다
  const s0 = E.createPlayer(3);
  // 세로 1 세 개를 미리 깔고, 축이 1 인 조각을 그 위에 떨어뜨려 1연쇄를 만든다
  const b = board('..1...', '..1...', '..1...');
  const s = { ...s0, board: b, piece: { ...s0.piece, axis: 1, child: 2, rot: 0 }, pendingGarbage: 2, carry: 60 };
  const out = E.hardDrop(s);
  eq('1연쇄', out.steps.length, 1);
  eq('40 + 이월 60 = 100점 → 방해 1', out.garbageOffset + out.garbageSent, 1);
  eq('대기 2 에서 1 상쇄, 전송 0', out.garbageSent, 0);
  eq('잔량 1', out.state.pendingGarbage, 1);
  eq('연쇄가 난 수에는 방해가 안 들어온다', out.garbageDropped.length, 0);
  eq('이월 30', out.state.carry, 30);
  eq('최고 연쇄 1', out.state.maxChain, 1);
}
{
  // 한 수에 들어오는 방해는 최대 30(5줄)
  let s = E.receiveGarbage(E.createPlayer(11), 45);
  const out = E.hardDrop(s);
  eq('30개만 들어온다', out.garbageDropped.length, 30);
  eq('15개는 다음 수로', out.state.pendingGarbage, 15);
}
{
  // 가로 조각은 열마다 따로 떨어진다
  const s0 = E.createPlayer(5);
  const b = board('..1...');
  const s = { ...s0, board: b, piece: { ...s0.piece, axis: 3, child: 4, rot: 1 } }; // 축 col2, 자식 col3
  const out = E.hardDrop(s);
  same('축은 1 위에, 자식은 바닥까지', out.boardAfterLock, board('..3...', '..14..'));
}

/* ─── 패배 판정 ─── */
console.log('7. 패배');
{
  const s0 = E.createPlayer(9);
  const b = E.emptyBoard();
  // 생성 열(2)을 row 2 까지 채운다 — 착지할 조각이 row 1·0 을 채우면 다음 조각 자리가 없다
  for (let row = 2; row < HEIGHT; row++) b[E.cellIndex(2, row)] = 5;
  const s = { ...s0, board: b, piece: { ...s0.piece, rot: 0 } };
  const out = E.hardDrop(s);
  eq('생성 자리가 막히면 LOST', out.state.status, 'LOST');
  eq('lost 플래그', out.lost, true);
  eq('조각이 없다', out.state.piece, null);
  eq('LOST 상태에서 이동은 무시', E.moveLeft(out.state), out.state);
}
{
  const s0 = E.createPlayer(9);
  const b = E.emptyBoard();
  // row 4 부터 채우면 착지 조각이 row 3·2 를 채우고 생성 자리(row 1·0)는 남는다
  for (let row = 4; row < HEIGHT; row++) b[E.cellIndex(2, row)] = 5;
  const out = E.hardDrop({ ...s0, board: b, piece: { ...s0.piece, rot: 0 } });
  eq('생성 자리가 남으면 아직 산다', out.state.status, 'PLAYING');
}

/* ─── 시드 결정론 · 인코딩 ─── */
console.log('8. 결정론·인코딩');
{
  const a = E.createPlayer(12345);
  const b = E.createPlayer(12345);
  const c = E.createPlayer(54321);
  eq('같은 시드 = 같은 첫 조각', JSON.stringify(a.piece), JSON.stringify(b.piece));
  eq('같은 시드 = 같은 미리보기', JSON.stringify(a.next), JSON.stringify(b.next));
  // 열을 돌아가며 놓는다 — 한 열에만 쌓으면 20수 전에 진다
  const placeAt = (s, col) => {
    let cur = s;
    for (let k = 0; k < WIDTH; k++) cur = E.moveLeft(cur);
    for (let k = 0; k < col; k++) cur = E.moveRight(cur);
    return E.hardDrop(cur).state;
  };
  let sa = a;
  let sb = b;
  for (let i = 0; i < 20; i++) {
    sa = placeAt(sa, i % WIDTH);
    sb = placeAt(sb, i % WIDTH);
  }
  eq('20수 뒤에도 같은 판', E.encodeBoard(sa.board), E.encodeBoard(sb.board));
  eq('20수 뒤에도 살아 있다', sa.status, 'PLAYING');
  check('다른 시드는 다른 순서', JSON.stringify(a.next) !== JSON.stringify(c.next) || JSON.stringify(a.piece) !== JSON.stringify(c.piece));
  eq('미리보기는 2개', a.next.length, E.PREVIEW_COUNT);
  check('색은 1~4', [a.piece.axis, a.piece.child, ...a.next.flat()].every((v) => v >= 1 && v <= 4));
}
{
  const b = board('G.1...', '2341G.');
  const text = E.encodeBoard(b);
  eq('78자', text.length, WIDTH * HEIGHT);
  same('encode → decode 왕복', E.decodeBoard(text), b);
  let threw = false;
  try {
    E.decodeBoard(text.slice(1));
  } catch {
    threw = true;
  }
  check('길이가 다르면 거절', threw);
  threw = false;
  try {
    E.decodeBoard(`${text.slice(0, -1)}9`);
  } catch {
    threw = true;
  }
  check('값 범위 밖은 거절', threw);
}
{
  // 소프트드롭: 내려가다 바닥이면 착지
  let s = E.createPlayer(2);
  let locked = null;
  let guard = 0;
  while (!locked && guard++ < HEIGHT + 2) {
    const r = E.softDrop(s);
    s = r.state;
    locked = r.locked;
  }
  check('softDrop 을 반복하면 착지한다', locked !== null && s.moves === 1);
  const hidden = E.createPlayer(2).piece;
  eq('생성 직후 자식은 숨은 줄(row 0)', E.pieceCells(hidden)[1][1], HIDDEN_ROWS - 1);
}

rmSync(tmp, { recursive: true, force: true });

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
