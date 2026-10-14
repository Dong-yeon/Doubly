/**
 * 채팅 사진 말풍선 크기 — 사진 비율대로(docs/chat-photo-crop_2026-10-14.md §4).
 *
 * <p>예전엔 200×200 정사각에 cover 라 세로로 긴 스크린샷은 가운데만 보였다. 이제 상자(최대 가로·세로) 안에
 * 비율을 지켜 넣는다 — 세로 스샷(9:20)은 좁고 길게, 가로 사진은 넓고 낮게. 너무 극단적인 비율(긴 파노라마·
 * 아주 긴 캡처)만 최소 한 변에 걸려 cover 로 조금 잘린다. 비율을 아직 모르면(처음 그릴 때) 정사각.
 *
 * <p>scripts/verify-photo-crop.mjs 가 함께 검증한다.
 */

export const CHAT_PHOTO_MAX_W = 220;
export const CHAT_PHOTO_MAX_H = 280;
/** 이보다 좁거나 낮게는 줄이지 않는다 — 말풍선이 실처럼 가늘어지면 누를 수가 없다 */
export const CHAT_PHOTO_MIN_SIDE = 110;
/** 비율을 모를 때 */
export const CHAT_PHOTO_DEFAULT = 200;

/** aspect = 가로/세로. 모르면(null·0·NaN) 정사각 */
export function chatPhotoSize(aspect: number | null | undefined): { width: number; height: number } {
  if (!aspect || !Number.isFinite(aspect) || aspect <= 0) {
    return { width: CHAT_PHOTO_DEFAULT, height: CHAT_PHOTO_DEFAULT };
  }
  let width = CHAT_PHOTO_MAX_W;
  let height = width / aspect;
  if (height > CHAT_PHOTO_MAX_H) {
    height = CHAT_PHOTO_MAX_H;
    width = height * aspect;
  }
  return {
    width: Math.round(Math.max(CHAT_PHOTO_MIN_SIDE, width)),
    height: Math.round(Math.max(CHAT_PHOTO_MIN_SIDE, height)),
  };
}
