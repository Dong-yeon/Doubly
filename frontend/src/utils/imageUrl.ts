/**
 * Cloudinary URL 변환 — 그리드 썸네일용.
 *
 * <p><b>왜 필요한가</b>: 앨범 그리드는 한 화면에 3열 × 여러 줄을 깔면서 원본 URL 을 그대로
 * 쓰고 있었다. 업로드 원본은 폰 카메라 사진(수 MB)이라 한 화면을 채우는 데 수십 MB 를
 * 받는 셈이고, 정작 칸 크기는 100dp 남짓이다. Cloudinary 는 URL 경로에 변환을 끼우면
 * 서버에서 줄여 주므로 백엔드에 썸네일 생성을 만들 필요가 없다.
 *
 * <p>업로드 URL 형태: {@code https://res.cloudinary.com/<cloud>/image/upload/v123/<publicId>.jpg}
 * → {@code .../image/upload/w_300,h_300,c_fill,q_auto,f_auto/v123/<publicId>.jpg}
 *
 * <p>Cloudinary 가 아닌 URL(카카오 이미지·외부 링크·로컬 파일)은 <b>그대로 돌려준다</b>.
 * 변환 문자열을 아무 URL 에나 끼우면 404 가 되므로 형태를 확인한 뒤에만 손댄다.
 */

/** 변환을 끼울 수 있는 Cloudinary 업로드 URL 인지 — `/image/upload/` 구간이 있어야 한다 */
const UPLOAD_MARKER = '/image/upload/';

/**
 * 정사각 썸네일 URL. `size` 는 dp 기준 한 변의 길이이며, 고해상도 화면을 고려해 2배로 요청한다
 * (그 이상은 눈에 띄는 차이 없이 용량만 늘어난다).
 *
 * @param url 원본 이미지 URL (null·빈 값이면 그대로 돌려준다)
 * @param size 칸 한 변의 길이(dp)
 */
export function thumbnailUrl(url: string, size = 150): string {
  const px = Math.max(1, Math.round(size)) * 2;
  if (isR2(url)) {
    return r2Resized(url, `width=${px},height=${px},fit=cover`);
  }
  if (!url || !url.includes(UPLOAD_MARKER)) {
    return url;
  }
  // 이미 변환이 끼워진 URL(w_ 로 시작하는 구간)은 두 번 손대지 않는다
  const [prefix, rest] = url.split(UPLOAD_MARKER);
  if (rest.startsWith('w_')) {
    return url;
  }
  return `${prefix}${UPLOAD_MARKER}w_${px},h_${px},c_fill,q_auto,f_auto/${rest}`;
}

/**
 * 폭만 줄인 URL — 카드 안 전폭 사진용(식사 카드 180dp 칸에 폰 원본 수 MB 를 받던 자리).
 * 비율은 그대로 두고(c_limit) 원본보다 키우지 않는다. `widthDp` 의 2배 픽셀로 요청한다.
 */
export function cardImageUrl(url: string, widthDp = 360): string {
  if (isR2(url)) {
    return r2Resized(url, `width=${Math.max(1, Math.round(widthDp)) * 2},fit=scale-down`);
  }
  if (!url || !url.includes(UPLOAD_MARKER)) {
    return url;
  }
  const [prefix, rest] = url.split(UPLOAD_MARKER);
  if (rest.startsWith('w_')) {
    return url;
  }
  const px = Math.max(1, Math.round(widthDp)) * 2;
  return `${prefix}${UPLOAD_MARKER}w_${px},c_limit,q_auto,f_auto/${rest}`;
}

/**
 * R2(2026-10-12~) 사진 줄이기 — Cloudflare 이미지 변환({@code /cdn-cgi/image/<옵션>/<경로>}).
 *
 * <p>R2 는 Cloudinary 처럼 주소에 변환을 끼울 수 없어 지금까지 원본(최대 2048px)을 그대로 받았다 — 채팅 말풍선
 * 200dp 칸에도(docs/chat-photo-crop_2026-10-14.md §1-2). 같은 영역(media.dubly.co.kr)에 Cloudflare 이미지 변환을
 * 켜면 경로 앞에 옵션만 붙여 줄인 사본을 받는다.
 *
 * <p><b>영역 대시보드에서 변환(Images › Transformations)을 켜야 동작한다</b> — 꺼진 채로 주소를 바꾸면 404 다
 * (2026-10-14 확인) — 같은 날 사용자가 켰고(This zone only), 경로 형식에서 cf-resized 응답·onerror 리다이렉트까지 확인해 스위치를 켰다. {@code onerror=redirect} 는 변환이 실패하면(무료 한도 초과 등) 원본으로
 * 돌려보내 사진이 깨지지 않게 한다.
 */
export const R2_IMAGE_RESIZE = true;
const R2_BASE = 'https://media.dubly.co.kr/';

function isR2(url: string | null | undefined): boolean {
  return R2_IMAGE_RESIZE && !!url && url.startsWith(R2_BASE) && !url.startsWith(`${R2_BASE}cdn-cgi/`);
}

function r2Resized(url: string, options: string): string {
  const key = url.slice(R2_BASE.length);
  return `${R2_BASE}cdn-cgi/image/${options},quality=80,format=auto,onerror=redirect/${key}`;
}
