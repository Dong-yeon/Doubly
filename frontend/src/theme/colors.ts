/**
 * Doubly 컬러 토큰 — White & Green.
 * 바탕은 <b>흰색</b>이고, 색은 <b>액센트에만</b> 쓴다 — 아이콘·선택 상태·소유자 구분:
 *   나 = Gold, 상대 = Green, 함께 = Olive. 크롬(버튼·활성탭·링크)은 Green.
 *
 * 아래 "호환 별칭"은 기존 코드(수십 개 파일)가 참조하던 키를 새 팔레트로 매핑해
 * 앱 전체가 한 번에 리스킨되도록 한다. (constants/theme.ts 가 이 파일을 re-export)
 *
 * ── 여기까지 온 경위 ─────────────────────────────────────────────
 * Coral/Indigo(빨강+파랑) → 국내에서 정당 색으로 읽힐 소지가 있어 교체.
 * Gold/Teal → 청록이 배경에 묻힘. Forest/Cream → 배경까지 초록이라 무거웠다.
 * 지금은 <b>바탕을 색에서 빼고</b> 흰색으로 두고, 초록·금색은 액센트로만 남겼다.
 *
 * ── 대비 검증 (WCAG: 그래픽 3:1 · 텍스트 4.5:1) ───────────────────
 * 라이트 (배경 #FAFAF9 / 표면 #FFFFFF / 트랙 #F1F2F0)
 *   나 Gold 4.94 / 5.16 / 4.59   상대 Green 4.92 / 5.14 / 4.57
 *   함께 Olive 4.90 / 5.12 / 4.56   primary 5.32 / 5.55 / 4.94 · 위에 white 5.55
 *   본문 16.29 / 17.01 / 15.15   보조 6.37 / 6.65 / 5.92
 *   칩(색 위 같은 계열 글자) me 4.66 · partner 4.51 · together 4.57 · primary 4.85
 * 다크 (배경 #1E201C / 표면 #262823 / 트랙 #31332D) — 중립 차콜, 액센트는 파스텔
 *   나 Gold 10.60 / 9.61 / 8.25   상대 Sage 9.73 / 8.82 / 7.57
 *   함께 Lime 10.92 / 9.90 / 8.50   본문 14.07 / 12.75 / 10.95
 *
 * ⚠️ 다크의 primary 만 4.5 미만이다(버튼 위 white 3.97 · 표면 위 글자 3.75).
 * 아래 primary 주석 참고 — 한 토큰이 두 역할을 겸해 생기는 수학적 상충이며,
 * 이전 Indigo 팔레트도 같은 이유로 4.21 / 3.96 이었다.
 *
 * ── 다크모드 ─────────────────────────────────────────────────────
 * 시스템 테마(Appearance)를 따라 앱 시작 시 팔레트를 고른다.
 * 모든 화면의 StyleSheet 가 모듈 로드 시점에 이 값으로 만들어지므로,
 * 실행 중 시스템 테마를 바꾸면 앱을 다시 시작해야 반영된다 (재실행 시 자동 적용).
 */
import { Appearance } from 'react-native';

const light = {
  // ── Doubly 코어 ──────────────────────────────────────────────
  cream: '#FFFFFF', // (구 크림) 지금은 순백 — 키 이름은 호환을 위해 유지
  ink: '#1A1D1A',
  coral: '#8A6817', // 나 (Gold) — 키 이름은 호환을 위해 유지
  indigo: '#2C7D33', // 상대 (Green)
  violet: '#59772D', // 함께 (Olive)

  // ── Duo 시맨틱 (나/상대/함께) ─────────────────────────────────
  me: '#8A6817',
  meBg: '#FBF3DF',
  partner: '#2C7D33',
  partnerBg: '#E8F3E9',
  together: '#59772D',
  togetherBg: '#EFF4E4',

  // ── 크롬 (Green) — 버튼·활성탭·링크·선택 상태 ─────────────────
  primary: '#2A7731',
  primaryDark: '#1F5A25',
  primaryLight: '#4E9E56',
  primaryBg: '#E9F2EA',

  // ── 텍스트 ───────────────────────────────────────────────────
  textPrimary: '#1A1D1A',
  // WCAG AA(4.5:1) — 가장 어두운 배경인 세그먼트 트랙(surfaceAlt #F1F2F0) 위에서도
  // 통과해야 한다. background 6.37 · surface 6.65 · surfaceAlt 5.92.
  textSecondary: '#585E58',
  textMuted: '#767C76',

  // ── 표면 ─────────────────────────────────────────────────────
  // background 를 살짝 낮춰야 흰 카드가 바탕에서 분리된다(그림자만으로는 약하다).
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceAlt: '#F1F2F0',
  background: '#FAFAF9',

  // ── 보더 ─────────────────────────────────────────────────────
  border: '#E4E6E3',
  borderStrong: 'rgba(26,29,26,0.15)',

  // ── 호환 별칭 (기존 키 → Doubly 팔레트) ───────────────────────
  couple: '#8A6817', // 커플 대표 → gold
  food: '#59772D', // (구 amber) → olive
  health: '#2C7D33', // (구 green) → green
  primarySoft: '#E9F2EA', // = primaryBg
  secondary: '#2C7D33', // 보조 액센트 → green
  secondarySoft: '#E8F3E9',
  accent: '#59772D', // 하이라이트/포인트 → olive
  accentSoft: '#EFF4E4',
  textTertiary: '#767C76',
  // 기능색(체크·완료). 브랜드 초록과 구분되도록 더 푸른 쪽으로 민다
  success: '#1F8A55',
  danger: '#E5484D',
  white: '#FFFFFF',
};

/**
 * 다크 팔레트 — 같은 키, 반전된 명도.
 * - 배경/표면: <b>중립 차콜</b> (#1E201C → #262823 → #31332D).
 *   포레스트 그린으로 깔았더니 화면 전체가 초록이라 무거웠다. 색은 액센트에만 남긴다.
 * - 소유자 색(Gold/Sage/Lime)은 어두운 배경 위라 파스텔일수록 대비가 올라간다.
 *   연한 배경(…Bg/…Soft)은 어둡게. white 는 "색 위에 얹는 텍스트" 용도라 유지
 */
const dark: typeof light = {
  cream: '#FFFFFF',
  ink: '#ECEEEA',
  coral: '#F1C999', // 나 (Gold) — 파스텔
  indigo: '#A7D2A9', // 상대 (Sage) — 파스텔
  violet: '#C9DA97', // 함께 (Lime) — 파스텔

  me: '#F1C999',
  meBg: '#332811',
  partner: '#A7D2A9',
  partnerBg: '#1D2E1F',
  together: '#C9DA97',
  togetherBg: '#2A2F19',

  /*
   * primary 는 다크에서 <b>두 가지 상충하는 역할</b>을 동시에 한다.
   *   ① 버튼 배경 — 위에 white 를 얹는다 → 어두울수록 좋다
   *   ② 링크·라벨 글자 — surface 위에 얹는다 → 밝을수록 좋다 (34곳이 이렇게 쓴다)
   * 둘 다 4.5 를 만족하는 값은 없다(전자는 휘도 ≤0.175, 후자는 ≥0.285 를 요구).
   * 그래서 이전 팔레트(Indigo #5B6BFF: white 4.21 / surface 3.96)와 같은 균형점에 둔다.
   * 해소하려면 링크 전용 토큰을 만들어 34곳을 옮겨야 한다.
   */
  primary: '#3E8E6B',
  primaryDark: '#2F7A55',
  primaryLight: '#68B58B',
  // 배경보다 어두운 웰 — 밝은 틴트로 두면 그 위의 primary 글자가 3:1도 안 나온다
  primaryBg: '#12211A',

  textPrimary: '#ECEEEA',
  textSecondary: '#A8AEA6', // background 7.25 · surface 6.57 · surfaceAlt 5.65
  textMuted: '#868C84',

  surface: '#262823',
  surfaceCard: '#262823',
  surfaceAlt: '#31332D',
  background: '#1E201C',

  border: '#3A3D36',
  borderStrong: 'rgba(236,238,234,0.18)',

  couple: '#F1C999',
  food: '#C9DA97',
  health: '#A7D2A9',
  primarySoft: '#12211A', // = primaryBg
  secondary: '#A7D2A9',
  secondarySoft: '#1D2E1F',
  accent: '#C9DA97',
  accentSoft: '#2A2F19',
  textTertiary: '#868C84',
  success: '#3FBF80',
  danger: '#F2555A',
  white: '#FFFFFF',
};

/** 현재 시스템 테마가 다크인지 — 지도(웹뷰) 등 팔레트 밖 분기에 사용 */
export const isDarkMode = Appearance.getColorScheme() === 'dark';

export const colors = isDarkMode ? dark : light;
