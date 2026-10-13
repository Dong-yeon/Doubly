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
 */
const Q = await import('../src/games/quarto/index.ts');

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

console.log(`${failed === 0 ? 'OK' : 'FAILED'} — ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
