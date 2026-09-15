/**
 * 사진 격자의 <b>열 수와 칸 크기</b> 계산 — 폭이 달라져도 칸 크기는 비슷하게 유지한다.
 * 화면에서 쓰는 형태는 `hooks/usePhotoGrid.ts`(폭을 넣어 주는 얇은 래퍼)다.
 *
 * <p><b>왜 필요한가</b>: 격자들이 열 수를 상수로 박아 두고 칸만 폭으로 나눠 썼다
 * (`(width - gap) / 3`). 폰에서는 문제가 없다 — 360dp(갤럭시 A)부터 440dp(대화면)까지
 * 3열 칸은 119~146dp 라 사실상 같은 밀도다. <b>깨지는 건 태블릿·폴더블</b>이다.
 * 2026-09-15 실기기(폭 1200dp) 확인 결과 "우리" 탭 칸이 한 변 400dp 짜리 판이 됐고,
 * 여행 앨범(2열)은 580dp 였다. 사진 여섯 장이 한 화면을 다 먹는다.
 *
 * <p><b>왜 "폭에 따라 열 수"가 아니라 "칸 크기에 따라 열 수"인가</b>: 폭으로 바로 열을
 * 늘리면 폰 사이에서도 열이 갈린다(예: 360dp 3열, 430dp 4열). 같은 앱이 기기마다 다른
 * 밀도로 보이고 화면 캡처·QA 기준도 기기마다 달라진다. 그래서 <b>폰은 화면이 정한 열
 * 수를 그대로 쓰고</b>(sw600dp 미만 = Android 가 폰으로 보는 폭) 태블릿부터만 열을
 * 늘린다. 늘릴 때의 목표 칸 크기는 임의의 숫자가 아니라 <b>기준 폰(390dp)에서 그 화면이
 * 갖는 칸 크기</b>다 — 화면이 이미 고른 밀도를 넓은 폭에서도 유지한다는 뜻이다.
 *
 * <p>순수 함수로 떼어 둔 이유: 프런트엔드에는 테스트 러너가 없어서
 * (CLAUDE.md 6절) 이런 판단식은 화면을 띄워야만 확인할 수 있었다. 훅에서 분리해
 * 두면 폭을 넣어 표를 뽑아보는 것만으로 검증된다.
 */

/** Android 가 "태블릿"으로 보는 최소 폭(sw600dp) — 경계를 새로 발명하지 않는다 */
export const TABLET_MIN_WIDTH = 600;

/** 목표 칸 크기를 뽑는 기준 폰 폭 — iPhone 14·갤럭시 S 계열의 논리 폭 */
export const PHONE_REF_WIDTH = 390;

export interface PhotoGridOptions {
  /** 칸 사이 간격 */
  gap: number;
  /** 격자 좌우 여백 (없으면 0) */
  padding?: number;
  /** 폰에서 쓸 열 수 — 이 화면의 설계값 */
  phoneColumns?: number;
  /**
   * 열 수 상한. 기본값은 폰 열 수의 두 배다 — 칸 크기만 따르면 폭 1200dp 에서 9열까지
   * 가는데, 그쯤이면 "사진첩"이 아니라 파일 목록으로 읽힌다.
   */
  maxColumns?: number;
}

export interface PhotoGrid {
  columns: number;
  /** 정사각 칸 한 변 */
  cell: number;
}

export function photoGrid(
  width: number,
  { gap, padding = 0, phoneColumns = 3, maxColumns }: PhotoGridOptions,
): PhotoGrid {
  const available = width - padding * 2;
  const max = maxColumns ?? phoneColumns * 2;
  let columns = phoneColumns;
  if (width >= TABLET_MIN_WIDTH) {
    const target = (PHONE_REF_WIDTH - padding * 2 - gap * (phoneColumns - 1)) / phoneColumns;
    /*
     * 내림이다 — 반올림하면 경계에서 칸이 <b>기준 폰보다 작아진다</b>(폭 600dp 에서
     * 5열 118dp vs 기준 129dp). 태블릿에서 폰보다 빽빽해지는 건 방향이 거꾸로다.
     */
    const fits = Math.floor((available + gap) / (target + gap));
    // 태블릿에서 폰과 같은 열 수로 남는 경우는 없다 — 최소한 한 열은 늘린다
    columns = Math.min(max, Math.max(phoneColumns + 1, fits));
  }
  return { columns, cell: (available - gap * (columns - 1)) / columns };
}
