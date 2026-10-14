/**
 * 사진 자르기 계산·채팅 사진 크기 검증 — utils/photoCrop.ts·utils/chatPhotoSize.ts 를 건드리면 돌린다.
 *
 * 정상 흐름(스샷 위아래 자르기)과 함께 "설마 이렇게 쓰겠어?" 쪽 — 틀을 0 으로 줄이기, 사진 밖으로 끌기,
 * 반대 방향으로 뒤집기, 아주 작은 사진, 비율 고정 중 변 끌기, 반올림 경계 — 을 본다.
 *
 * 실행: node --experimental-strip-types scripts/verify-photo-crop.mjs
 *
 * package.json 에 아직 등록하지 않았다 — npm scripts 는 EAS fingerprint 입력이라(verify-home-event.mjs 주석).
 */
const { dragRect, hitTest, fitRatio, ratioOf, toSourceCrop, MIN_SIDE } = await import('../src/utils/photoCrop.ts');
const { chatPhotoSize, CHAT_PHOTO_MAX_W, CHAT_PHOTO_MAX_H, CHAT_PHOTO_MIN_SIDE } = await import('../src/utils/chatPhotoSize.ts');

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) failed++;
};
const inside = (r, W, H) => r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 1e-9 && r.y + r.h <= H + 1e-9;
const near = (a, b) => Math.abs(a - b) < 1e-6;

// 화면에 300×666 으로 그려진 세로 스샷(1080×2400, k = 300/1080)
const W = 300, H = 2400 * (300 / 1080);
const full = { x: 0, y: 0, w: W, h: H };

// --- 무엇을 잡았나 ---
check('왼쪽 위 모서리', hitTest(5, 5, full, false) === 'tl');
check('오른쪽 아래 모서리', hitTest(W - 3, H - 3, full, false) === 'br');
check('위 변 가운데', hitTest(150, 10, full, false) === 't');
check('비율 고정이면 위 변은 안쪽 이동', hitTest(150, 10, full, true) === 'move');
check('안쪽은 이동', hitTest(150, 300, full, false) === 'move');
check('틀 밖은 아무것도 아님', hitTest(150, 300, { x: 0, y: 0, w: 100, h: 100 }, false) === null);
const tiny = { x: 100, y: 100, w: MIN_SIDE, h: MIN_SIDE };
check('작은 틀에서도 모서리가 이동보다 먼저', hitTest(100, 100, tiny, false) === 'tl');

// --- 스샷 위아래 자르기(정상 흐름) ---
let r = dragRect('t', full, 0, 120, W, H, null);
r = dragRect('b', r, 0, -200, W, H, null);
check('위 120·아래 200 잘라내기', near(r.y, 120) && near(r.h, H - 320) && near(r.w, W));
const crop = toSourceCrop(r, 300 / 1080, 1080, 2400);
check('원본 좌표로 바뀐다(y 432, 높이 2400-432-720=1248)', crop && crop.originY === 432 && crop.height === 1248 && crop.width === 1080);

// --- 이상 사용 ---
const shrunk = dragRect('br', full, -5000, -5000, W, H, null);
check('틀을 0 으로 줄여도 최소 한 변은 남는다', near(shrunk.w, MIN_SIDE) && near(shrunk.h, MIN_SIDE));
const flipped = dragRect('tl', full, 5000, 5000, W, H, null);
check('왼쪽 위를 오른쪽 아래 너머로 끌어도 뒤집히지 않는다', flipped.w >= MIN_SIDE && flipped.h >= MIN_SIDE && inside(flipped, W, H));
const out = dragRect('move', { x: 50, y: 50, w: 100, h: 100 }, -999, 999, W, H, null);
check('사진 밖으로 끌어도 안에 갇힌다', inside(out, W, H) && out.x === 0 && near(out.y, H - 100));
const grow = dragRect('br', { x: 50, y: 50, w: 100, h: 100 }, 9999, 9999, W, H, null);
check('사진보다 크게 키워도 사진까지만', inside(grow, W, H) && near(grow.w, W - 50) && near(grow.h, H - 50));
// 사진 자체가 최소 한 변보다 작다(30×20 으로 그려진 작은 스티커)
const small = dragRect('br', { x: 0, y: 0, w: 30, h: 20 }, -100, -100, 30, 20, null);
check('최소 한 변보다 작은 사진에서도 사진 밖으로 안 나간다', inside(small, 30, 20) && small.w > 0 && small.h > 0);
check('비율 고정 중 변 모드는 그대로', dragRect('t', full, 0, 100, W, H, 1) === full);
check('모드 없음은 그대로', dragRect(null, full, 10, 10, W, H, null) === full);

// --- 비율 ---
const sq = fitRatio(full, 1, W, H);
check('1:1 은 가로에 맞춘 정사각, 가운데', near(sq.w, W) && near(sq.h, W) && near(sq.y, (H - W) / 2));
const sqDrag = dragRect('br', sq, -100, 0, W, H, 1);
check('1:1 에서 모서리를 끌어도 정사각', near(sqDrag.w, sqDrag.h) && inside(sqDrag, W, H));
const sqBig = dragRect('tl', sq, -9999, -9999, W, H, 1);
check('1:1 을 한없이 키워도 사진 안', inside(sqBig, W, H) && near(sqBig.w, sqBig.h));
const p45 = fitRatio({ x: 0, y: 600, w: 10, h: 10 }, 4 / 5, W, H);
check('4:5 는 가장자리 근처 중심이어도 사진 안', inside(p45, W, H) && near(p45.w / p45.h, 0.8));
check('원본 비율', near(ratioOf('original', 1080, 2400), 0.45) && ratioOf('free', 1, 1) === null);
check('높이 0 원본은 비율 없음(나누기 0 방지)', ratioOf('original', 100, 0) === null);

// --- 원본 좌표 ---
check('전체 그대로면 null(재인코딩 안 함)', toSourceCrop(full, 300 / 1080, 1080, 2400) === null);
const edge = toSourceCrop({ x: 299.9, y: 665.9, w: 0.1, h: 0.1 }, 300 / 1080, 1080, 2400);
check('끝자락 반올림도 사진 밖을 가리키지 않는다', edge && edge.originX + edge.width <= 1080 && edge.originY + edge.height <= 2400 && edge.width >= 1);

// --- 채팅 말풍선 크기 ---
const shot = chatPhotoSize(1080 / 2400);
check('세로 스샷은 높이 상한에 맞춰 좁고 길게', shot.height === CHAT_PHOTO_MAX_H && shot.width === Math.round(CHAT_PHOTO_MAX_H * 0.45));
const land = chatPhotoSize(4 / 3);
check('가로 사진은 너비 상한에 맞춰', land.width === CHAT_PHOTO_MAX_W && land.height === Math.round(CHAT_PHOTO_MAX_W * 0.75));
check('정사각은 상한 너비 정사각', chatPhotoSize(1).width === CHAT_PHOTO_MAX_W && chatPhotoSize(1).height === CHAT_PHOTO_MAX_W);
const pano = chatPhotoSize(10);
check('긴 파노라마는 최소 높이에서 멈춘다', pano.height === CHAT_PHOTO_MIN_SIDE && pano.width === CHAT_PHOTO_MAX_W);
const needle = chatPhotoSize(0.05);
check('아주 긴 캡처는 최소 너비에서 멈춘다', needle.width === CHAT_PHOTO_MIN_SIDE && needle.height === CHAT_PHOTO_MAX_H);
check('비율 모름(null·0·NaN·음수)은 정사각 기본값',
  [null, undefined, 0, NaN, -1, Infinity].every((a) => chatPhotoSize(a).width === chatPhotoSize(a).height));

if (failed > 0) {
  console.error(`\n${failed}건 실패`);
  process.exit(1);
}
console.log('\n전부 통과');
