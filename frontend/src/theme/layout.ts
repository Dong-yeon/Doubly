/**
 * 레이아웃 상수 — 화면 간 리듬을 맞추는 값들.
 *
 * <p>실측에서 같은 역할의 값이 화면마다 갈렸다.
 * <ul>
 *   <li>스크롤 하단 여백: 120 · 100 · 96 · 48 · 32 · 없음 — 한 파일 안에서
 *       96 과 120 을 함께 쓰는 곳도 있었다(지도 모드에서 콘텐츠가 FAB 에 가림)</li>
 *   <li>리스트 카드 간격: 8 · 16 · 24 — 탭을 옮길 때마다 목록의 호흡이 바뀐다</li>
 *   <li>아이콘+텍스트 행의 아이콘 폭: 24~46 — 텍스트 시작점이 어긋난다</li>
 * </ul>
 */
import { spacing } from './spacing';

export const layout = {
  /** 화면 좌우 기본 패딩 */
  screenPadding: spacing.lg,

  /** 리스트 카드 사이 간격 */
  cardGap: spacing.sm,

  /** 섹션(카드 묶음) 사이 간격 */
  sectionGap: spacing.lg,

  /**
   * 스크롤 최하단 여백 — 하단에 떠 있는 FAB 이 마지막 항목을 가리지 않게.
   * FAB(56) + 하단 여백(24) + 숨쉴 공간을 더한 값.
   */
  listBottomWithFab: 120,

  /** FAB 이 없는 화면의 스크롤 하단 여백 */
  listBottom: spacing.xl,

  /** 아이콘+텍스트 행에서 아이콘 컨테이너 고정 폭 — 텍스트 기준선을 맞춘다 */
  rowIcon: 40,

  /** 터치 타깃 최소 — iOS HIG 44pt / Android 48dp 중 큰 쪽에 맞추려면 48 */
  touchTarget: 44,
} as const;
