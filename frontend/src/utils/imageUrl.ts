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
  if (!url || !url.includes(UPLOAD_MARKER)) {
    return url;
  }
  // 이미 변환이 끼워진 URL(w_ 로 시작하는 구간)은 두 번 손대지 않는다
  const [prefix, rest] = url.split(UPLOAD_MARKER);
  if (rest.startsWith('w_')) {
    return url;
  }
  const px = Math.max(1, Math.round(size)) * 2;
  return `${prefix}${UPLOAD_MARKER}w_${px},h_${px},c_fill,q_auto,f_auto/${rest}`;
}
