/**
 * 틀린그림찾기 좌표 변환 검증 — src/games/spotDiff 를 건드리면 돌린다.
 *
 * 탭 → 이미지 좌표(0~1)가 틀리면 서버 판정이 맞아도 "분명 눌렀는데 오답"이 된다. 확대 배율, 위아래/좌우 배치,
 * 패널과 이미지 비율이 다를 때(contain 여백), 패널 사이 간격, 연타 판정을 본다.
 *
 * 실행: node --experimental-strip-types scripts/verify-spot-diff.mjs
 *
 * package.json 에 아직 등록하지 않았다 — npm scripts 는 EAS fingerprint 입력이다(verify-quarto.mjs 와 같은 이유).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = fileURLToPath(new URL('../src/games/spotDiff/coords.ts', import.meta.url));
const C = await import(pathToFileURL(src).href);

let failed = 0;
let passed = 0;
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const check = (name, cond) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`FAIL ${name}`);
  }
};
const checkPoint = (name, got, panel, x, y, eps = 1e-9) =>
  check(`${name} → ${JSON.stringify(got)} (기대 panel=${panel} ${x},${y})`,
    got !== null && got.panel === panel && close(got.x, x, eps) && close(got.y, y, eps));

// ── 위아래 배치, 확대 1 ────────────────────────────────────────────
{
  // 360×700 칸, 1600×1200 사진 → 패널 360×270, 간격 8
  const L = C.boardLayout(360, 700, 1600, 1200, 'stacked', 8);
  check('stacked 패널 크기', close(L.panels[0].width, 360) && close(L.panels[0].height, 270));
  check('stacked B 패널은 아래', close(L.panels[1].y, 278) && close(L.panels[1].x, 0));
  check('stacked 판 높이', close(L.height, 548));
  checkPoint('A 가운데', C.boardToImage(180, 135, L, C.IDENTITY), 0, 0.5, 0.5);
  checkPoint('B 가운데 = A 가운데 좌표', C.boardToImage(180, 278 + 135, L, C.IDENTITY), 1, 0.5, 0.5);
  checkPoint('A 왼쪽 위', C.boardToImage(0, 0, L, C.IDENTITY), 0, 0, 0);
  checkPoint('B 오른쪽 아래', C.boardToImage(360, 548, L, C.IDENTITY), 1, 1, 1);
  checkPoint('A (90,67.5)', C.boardToImage(90, 67.5, L, C.IDENTITY), 0, 0.25, 0.25);
  check('패널 사이 간격은 null', C.boardToImage(180, 274, L, C.IDENTITY) === null);
  check('판 밖은 null', C.boardToImage(400, 100, L, C.IDENTITY) === null);
}

// ── 좌우 배치 ─────────────────────────────────────────────────────
{
  // 가로 화면 900×400, 1600×1200 → 슬롯 446×400 → 패널 446×334.5
  const L = C.boardLayout(900, 400, 1600, 1200, 'side', 8);
  const p = L.panels[0];
  check('side 패널은 이미지 비율', close(p.width / p.height, 1600 / 1200));
  check('side B 패널은 오른쪽', close(L.panels[1].x, p.width + 8) && close(L.panels[1].y, 0));
  checkPoint('side A 가운데', C.boardToImage(p.width / 2, p.height / 2, L, C.IDENTITY), 0, 0.5, 0.5);
  checkPoint('side B 의 같은 자리', C.boardToImage(p.width + 8 + p.width * 0.3, p.height * 0.7, L, C.IDENTITY), 1, 0.3, 0.7);
  check('side 간격은 null', C.boardToImage(p.width + 4, p.height / 2, L, C.IDENTITY) === null);
}

// ── 세로 사진 — 칸 높이에 막혀 패널이 칸보다 좁다 ────────────────────
{
  const L = C.boardLayout(360, 700, 1200, 1600, 'stacked', 8);
  check('세로 사진 패널 높이 = (700-8)/2', close(L.panels[0].height, 346));
  check('세로 사진 패널 너비 = 346×0.75', close(L.panels[0].width, 259.5));
  checkPoint('세로 사진 B 오른쪽 위', C.boardToImage(259.5, 354, L, C.IDENTITY), 1, 1, 0);
}

// ── 패널 비율 ≠ 이미지 비율(contain 여백) ─────────────────────────
{
  // 정사각 패널에 4:3 사진 → 위아래 여백. 패널 300×300, 이미지 300×225, 여백 37.5
  const L = C.boardLayout(300, 608, 1600, 1200, 'stacked', 8, 1);
  check('정사각 패널', close(L.panels[0].width, 300) && close(L.panels[0].height, 300));
  check('contain 여백 37.5', close(L.image.y, 37.5) && close(L.image.height, 225));
  check('여백을 누르면 null', C.boardToImage(150, 20, L, C.IDENTITY) === null);
  checkPoint('여백 아래 첫 줄', C.boardToImage(150, 37.5, L, C.IDENTITY), 0, 0.5, 0);
  checkPoint('이미지 가운데', C.boardToImage(150, 150, L, C.IDENTITY), 0, 0.5, 0.5);
  checkPoint('B 이미지 아래 끝', C.boardToImage(0, 308 + 262.5, L, C.IDENTITY), 1, 0, 1);
  // 이미지 → 패널 → 판 → 이미지 왕복
  const p = C.imageToPanel(0.2, 0.9, L);
  checkPoint('contain 왕복', C.boardToImage(p.x, p.y, L, C.IDENTITY), 0, 0.2, 0.9);
}

// ── 확대 배율 ─────────────────────────────────────────────────────
{
  const L = C.boardLayout(360, 700, 1600, 1200, 'stacked', 8); // 패널 360×270
  const t2 = { scale: 2, tx: 0, ty: 0 };
  // 2배 확대, 이동 없음 — 화면 가운데는 여전히 이미지 가운데, 화면 왼쪽 위 끝은 이미지 (0.25,0.25)
  checkPoint('2배 가운데', C.boardToImage(180, 135, L, t2), 0, 0.5, 0.5);
  checkPoint('2배 왼쪽 위', C.boardToImage(0, 0, L, t2), 0, 0.25, 0.25);
  checkPoint('2배 B 오른쪽 아래', C.boardToImage(360, 278 + 270, L, t2), 1, 0.75, 0.75);
  // 2배 + 오른쪽으로 180 이동(왼쪽 끝이 보이게) — 화면 왼쪽 위 = 이미지 (0, 0.25)
  const tMove = C.clampTransform({ scale: 2, tx: 180, ty: 0 }, 360, 270);
  check('2배 이동 한계 180', close(tMove.tx, 180));
  checkPoint('2배 + 이동 왼쪽 위', C.boardToImage(0, 0, L, tMove), 0, 0, 0.25);
  checkPoint('2배 + 이동 B 에서도 같은 변환', C.boardToImage(90, 278 + 135, L, tMove), 1, 0.125, 0.5);
  // 3배 + 위아래 이동
  const t3 = C.clampTransform({ scale: 3, tx: -100, ty: 135 }, 360, 270);
  const img = C.boardToImage(200, 50, L, t3);
  const back = C.transformPoint(...Object.values(C.imageToPanel(img.x, img.y, L)), t3, 360, 270);
  check('3배 왕복(화면 → 이미지 → 화면)', close(back.x, 200, 1e-6) && close(back.y, 50, 1e-6));
  // 한계
  const over = C.clampTransform({ scale: 9, tx: 9999, ty: -9999 }, 360, 270);
  check('배율 상한', over.scale === C.MAX_SCALE);
  check('이동 상한', close(over.tx, (C.MAX_SCALE - 1) * 180) && close(over.ty, -(C.MAX_SCALE - 1) * 135));
  check('축소는 1까지', C.clampTransform({ scale: 0.3, tx: 50, ty: 0 }, 360, 270).scale === 1);
  check('배율 1 이면 이동 0', C.clampTransform({ scale: 0.3, tx: 50, ty: 0 }, 360, 270).tx === 0);
  // 확대 + contain 여백
  const Lc = C.boardLayout(300, 608, 1600, 1200, 'stacked', 8, 1);
  checkPoint('확대 + 여백 가운데', C.boardToImage(150, 150, Lc, { scale: 2, tx: 0, ty: 0 }), 0, 0.5, 0.5);
  checkPoint('확대 + 여백 위 끝', C.boardToImage(150, 0, Lc, { scale: 2, tx: 0, ty: 0 }), 0, 0.5, 0.5 - 75 / 225);
}

// ── 반지름 ───────────────────────────────────────────────────────
{
  const L = C.boardLayout(360, 700, 1600, 1200, 'stacked', 8);
  check('반지름은 긴 변 기준', close(C.radiusToPanel(0.02, L), 7.2));
  const Lp = C.boardLayout(360, 700, 1200, 1600, 'stacked', 8);
  check('세로 사진 반지름도 긴 변(높이) 기준', close(C.radiusToPanel(0.02, Lp), 0.02 * 346));
}

// ── 연타 ─────────────────────────────────────────────────────────
{
  const pending = [{ x: 0.5, y: 0.5 }];
  check('같은 자리 연타는 무시', C.isDuplicateTap(pending, 0.505, 0.5, 1600, 1200));
  check('짧은 변 3% 밖은 보낸다', !C.isDuplicateTap(pending, 0.53, 0.5, 1600, 1200));
  check('세로 거리는 높이로 잰다(0.5+0.03 은 36px = 3%)', !C.isDuplicateTap(pending, 0.5, 0.531, 1600, 1200));
  check('기다리는 탭이 없으면 보낸다', !C.isDuplicateTap([], 0.5, 0.5, 1600, 1200));
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
