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
import { readAccentVariantSync, readThemeModeSync } from './themePreference';

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

  /*
   * 채움 전용 — 아바타 채움·완료 칩·배지처럼 <b>면적이 큰 자리</b>에 쓴다. 위에는 ink 글자를
   * 얹는다(onColor 가 자동으로 고른다).
   *
   * 왜 따로 두나: me/partner/together 는 흰 바탕 위 <b>글자</b>로도 쓰이므로 4.5:1 을 맞추려
   * L 32 까지 내려가 있다. 그 값을 면에 그대로 쓰면 아바타·칩이 갈색·숲초록 덩어리가 되어
   * "커플 앱치고 무겁다"는 인상의 직접 원인이었다(docs/UI_UX_COMPETITIVE_REVIEW_2026-09-22.md
   * §3-3). 같은 hue 로 L 58 — ink 글자 대비 8.0~8.6.
   *
   * 글자 없이 색 점만 놓는 자리(캘린더 마커·게임 점수 점·그래프 막대)에는 쓰지 않는다 —
   * 바탕 대비가 1.9~2.0 이라 그래픽 기준(3:1)에 못 미친다. 그런 자리는 원색을 유지한다.
   */
  meFill: '#E0B248',
  partnerFill: '#60C769',
  togetherFill: '#9EC464',

  /*
   * 파스텔 서피스 — …Bg 보다 한 단계 짙은 파스텔. 배지·칩용 …Bg 는 이미 meText/together
   * 같은 원색 텍스트와 짝지어 대비가 4.5:1 턱걸이로 맞춰져 있어(위 실측 참고) 더 짙게
   * 만들 수 없다. 이 토큰은 <b>ink 텍스트 전용</b>이다 — ink 는 어떤 밝기의 배경과
   * 짝지어도 12:1 이상 나오므로, "덜 흰 배경"으로 파스텔감을 내는 유일한 안전지대다.
   * 아이콘만 얹는 자리는 원색 아이콘을 그대로 써도 된다(그래픽 기준 3:1, 실측 3.9~4.0).
   */
  mePastelBg: '#F6E2B2',
  partnerPastelBg: '#C6E1C8',
  togetherPastelBg: '#DAE6C1',

  /*
   * 소유자 색의 "텍스트용" 변형.
   *
   * 이전 팔레트(Coral/Indigo/Violet)는 채도가 높아 흰 배경 위 글자로 쓰면 2.5~4.0:1 로
   * AA 에 못 미쳐 별도의 어두운 변형이 필요했다. 지금의 Gold/Green/Olive 는 위 주석의
   * 실측대로 <b>원색 그대로 4.5 를 넘기므로</b> 같은 값을 가리킨다 —
   * 호출부가 "글자면 …Text" 한 가지 규칙만 쓰도록 키는 남겨둔다.
   */
  meText: '#8A6817',
  partnerText: '#2C7D33',
  togetherText: '#59772D',

  // ── 크롬 (Green) — 버튼·활성탭·링크·선택 상태 ─────────────────
  primary: '#2A7731',
  primaryDark: '#1F5A25',
  primaryLight: '#4E9E56',
  /**
   * 크롬 <b>채움 전용</b> — 버튼·활성 칩처럼 면으로 칠하는 자리(2026-09-23).
   *
   * <p><b>왜 primary 와 따로 두나</b>: primary 는 글자로 115곳, 채움으로 48곳 쓰인다.
   * 흰 바탕 위 글자로 4.5:1 을 넘기려면 L 35 아래여야 하고, 그 값을 면에도 쓰니
   * 버튼이 어두워졌다(§3-3 이 소유자 색에서 겪은 것과 같은 상충). 채움을 분리하면
   * 글자용 primary 는 어둡게 두고 면만 밝힐 수 있다.
   *
   * <p>위에 얹는 글자는 {@code onColor()} 가 배경 휘도로 고른다 — 이 값 위에서는 ink 다
   * (실측 7.87). 바탕 대비는 2.07 이다 — 글자가 식별을 맡는 채움이라 3:1 을 강제하지 않는다
   * (채팅 검증 스크립트도 말풍선 대 배경을 1.1 로 잡는다).
   *
   * <p><b>상대 Green 과 겹치지 않게 둔다</b>: partnerFill(#60C769, L58)과 같은 값이면
   * §3-1 의 "크롬 = 상대 색 → 앱이 상대 것처럼 보인다"가 되살아난다. 여기는 hue 137 로 벌려 두었지만
   * <b>L54 로 올리면서 명도 차가 사라졌다</b>(2026-09-23) — 실기기에서 나란히 보고 판단할 것.
   */
  primaryFill: '#4DC76E',
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

  // 모달·시트 뒤에 까는 어둡게 덮개. 화면마다 rgba(0,0,0,0.4~0.45) 를 직접 쓰다 보니
  // 값이 갈렸다. 다크에서는 이미 어두운 배경 위에 얹는 것이라 더 진하게 해야
  // 시트와 배경이 분리돼 보인다(아래 dark 참고).
  backdrop: 'rgba(0,0,0,0.42)',

  // PC(웹)에서 앱 셸 <b>바깥</b>에 깔리는 바탕. 셸(background #FAFAF9)이 그 위에 떠
  // 보여야 하므로 한 단계 어둡게 둔다 — surfaceAlt 를 그대로 쓰면 다크에서
  // 바깥이 오히려 밝아져 관계가 뒤집힌다(dark 쪽 값 참고). components/AppShell.web.tsx.
  shellBackdrop: '#EDEEEB',

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
  success: '#1E8652', // white 위 4.58 — 2026-09-25 대비 검증(예전 #1F8A55 는 4.35)
  // success 의 연한 배경 — 정산 완료 배너 등. 하드코딩 민트(#E7F5EE)가
  // 다크모드에서 흰 덩어리로 남던 것을 토큰으로 흡수했다
  successBg: '#E7F5EE',
  danger: '#E12D33', // white 위 4.54 — 글자(탈퇴 행·입력 오류)로 27곳에서 쓰인다. 예전 #E5484D 는 3.91
  // danger 의 배지용 짝 — 연한 배경 + 그 위에서 4.5 를 넘기는 어두운 글자
  // (danger 원색은 연한 배경 위 글자로 3.6 이라 못 쓴다). Badge 'rose' 가 하드코딩하던 값
  dangerBg: '#FFF0EF',
  dangerText: '#9B3330',
  white: '#FFFFFF',

  // ── 로고 마크 (DoublyMark) — 액센트를 따른다 ────────────────────
  // 앱 아이콘(DoublySquareMark·icon.png)은 브랜드라 고정이고, 인앱 마크만 액센트에 맞춘다.
  // Back = 상대 계열 연한 하트, Front = 크롬 진한 하트, Sparkle = 금색 반짝임
  markBack: '#8FCB98',
  markFront: '#1F5A25',
  markSparkle: '#D9A441',
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

  // 다크의 액센트는 이미 파스텔(L 78~85)이라 채움으로도 그대로 쓴다 — ink(다크에서는 밝은 값)가
  // 아니라 onColor 가 고르는 어두운 글자가 위에 얹힌다
  meFill: '#F1C999',
  partnerFill: '#A7D2A9',
  togetherFill: '#C9DA97',

  // 다크는 …Bg 가 이미 짙은 웰이라 그대로 재사용 — 텍스트(ink)가 밝아 대비가 넉넉하다
  mePastelBg: '#332811',
  partnerPastelBg: '#1D2E1F',
  togetherPastelBg: '#2A2F19',

  /*
   * 다크에서는 파스텔 액센트가 이미 8~10:1 로 통과한다(위 주석 실측 참고).
   * 더 어둡게 만들 이유가 없어 원색을 그대로 가리킨다 — 라이트와 키 이름을 맞춰
   * 호출부가 테마를 신경 쓰지 않게 한다.
   */
  meText: '#F1C999',
  partnerText: '#A7D2A9',
  togetherText: '#C9DA97',

  /*
   * primary 는 다크에서 <b>두 가지 상충하는 역할</b>을 동시에 한다.
   *   ① 버튼 배경 — 위에 white 를 얹는다 → 어두울수록 좋다
   *   ② 링크·라벨 글자 — surface 위에 얹는다 → 밝을수록 좋다 (34곳이 이렇게 쓴다)
   * 둘 다 4.5 를 만족하는 값은 없다(전자는 휘도 ≤0.175, 후자는 ≥0.285 를 요구).
   * 그래서 이전 팔레트(Indigo #5B6BFF: white 4.21 / surface 3.96)와 같은 균형점에 둔다.
   * 해소하려면 링크 전용 토큰을 만들어 34곳을 옮겨야 한다.
   */
  primary: '#459E77', // surface 위 4.55 — 링크·선택 칩 글자. 예전 #3E8E6B 는 3.75 (2026-09-25)
  primaryDark: '#2F7A55',
  primaryLight: '#68B58B',
  /** 크롬 채움 — 다크는 파스텔이라 위에 ink 가 얹힌다(6.94). 라이트 주석 참고 */
  primaryFill: '#68B58B',
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

  // 라이트보다 진하게 — 어두운 배경 위 검은 덮개는 분리감이 약하다
  backdrop: 'rgba(0,0,0,0.62)',

  // background(#1E201C)보다 어둡다 — 라이트와 같은 "셸이 바탕 위에 떠 있다"는 관계를
  // 유지하려면 다크에서는 바깥을 더 낮춰야 한다.
  shellBackdrop: '#141613',

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
  // 다크 success 배경 — success(#3FBF80) 텍스트가 위에서 4.5:1 이상 나오는 어두운 그린
  successBg: '#1C3327',
  danger: '#F25A5F', // surface 위 4.54 (예전 #F2555A 는 4.41)
  dangerBg: '#3A1F20',
  dangerText: '#F2A0A0',
  white: '#FFFFFF',

  // 다크의 마크 — 어두운 배경 위라 밝게 (DoublyMark onDark 와 같은 값)
  markBack: '#BFE3C4',
  markFront: '#5FBE73',
  markSparkle: '#FFF3C4',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

/*
 * ── 액센트 변형 (사용자 선택, 2026-09-23) ────────────────────────────
 * 앱 액센트를 사용자가 고른다 — 설정 > 화면 > 액센트. 채팅 배경 테마와 같은 <b>기기별</b>
 * 설정이다. 중립(바탕·글자·보더)은 공통이고 <b>액센트·크롬·마크만</b> 갈아끼우므로
 * 나/상대/함께의 의미와 대비 기준은 세 변형이 같다.
 *
 * 왜 하나로 정하지 않고 고르게 하나: 색조 하나를 정하느라 팔레트를 네 번 갈았고
 * (파일 상단 경위), "커플 앱치고 무겁다"의 원인이 색조가 아니라 명도였음이 밝혀진 뒤에도
 * 색조 취향은 남았다(docs/UI_UX_COMPETITIVE_REVIEW_2026-09-22.md §3-3·§3-4). 채팅 배경을
 * 취향으로 열어둔 것과 같은 결정이다. 앱 아이콘·스토어·캐릭터는 한 색이어야 하므로
 * <b>대표 액센트 하나</b>는 실기기 확인 후 따로 정한다(그때까지 기본은 green).
 *
 * 값은 hue·채도에서 생성했고 검증 기준은 green 과 같다 — 글자 4.5:1(트랙 위), 채움 위
 * ink ≥ 5.8, 다크 액센트 ≥ 9.5. 다크 primary 는 세 변형 모두 같은 이중 역할 상충
 * (white 3.9 / 표면 3.8)을 안고 있다(dark 블록의 primary 주석).
 *
 *   green — 나 Gold(H42) · 상대 Green(H125) · 함께 Olive(H84) · 크롬 Green (본체 값)
 *   mint  — 나 Gold(H42) · 상대 Mint(H160) · 함께 Lime(H100) · 크롬 Mint
 *   peach — 나 Peach(H20) · 상대 Sage(H130, 저채도) · 함께 Gold(H50) · 크롬 Sage
 *
 * 새 액센트 토큰을 만들면 <b>세 변형 × 두 스킴</b>에 다 넣는다 — 빠뜨리면 그 변형에서만
 * green 값이 새어 나온다(Partial 이라 컴파일러가 잡아주지 않는다).
 */
export type AccentVariant = 'green' | 'mint' | 'peach';

const ACCENT_OVERRIDES: Record<Exclude<AccentVariant, 'green'>, Record<Scheme, Partial<Palette>>> = {
  mint: {
    light: {
      me: '#8C6918', meBg: '#F8F3E7', mePastelBg: '#EEDEBA', meText: '#8C6918', meFill: '#E5B443',
      partner: '#2E7A61', partnerBg: '#E7F8F3', partnerPastelBg: '#BAEEDC', partnerText: '#2E7A61', partnerFill: '#5EC9A6',
      together: '#487A2E', togetherBg: '#EDF8E7', togetherPastelBg: '#CBEEBA', togetherText: '#487A2E', togetherFill: '#82C95E',
      primary: '#2E7A61', primaryDark: '#225946', primaryLight: '#45B590', primaryFill: '#49CAA5', primaryBg: '#E9F7F2', primarySoft: '#E9F7F2',
      coral: '#8C6918', indigo: '#2E7A61', violet: '#487A2E', couple: '#8C6918', food: '#487A2E', health: '#2E7A61',
      secondary: '#2E7A61', secondarySoft: '#E7F8F3', accent: '#487A2E', accentSoft: '#EDF8E7',
      markBack: '#90D5BE', markFront: '#225946', markSparkle: '#D9A441',
    },
    dark: {
      me: '#E6D3A8', meBg: '#322915', mePastelBg: '#322915', meText: '#E6D3A8', meFill: '#E6D3A8',
      partner: '#A8E6D1', partnerBg: '#153228', partnerPastelBg: '#153228', partnerText: '#A8E6D1', partnerFill: '#A8E6D1',
      together: '#BDE6A8', togetherBg: '#1F3215', togetherPastelBg: '#1F3215', togetherText: '#BDE6A8', togetherFill: '#BDE6A8',
      primary: '#439D80', primaryDark: '#347962', primaryLight: '#62BC9E', primaryFill: '#62BC9E', primaryBg: '#0F241D', primarySoft: '#0F241D',
      coral: '#E6D3A8', indigo: '#A8E6D1', violet: '#BDE6A8', couple: '#E6D3A8', food: '#BDE6A8', health: '#A8E6D1',
      secondary: '#A8E6D1', secondarySoft: '#153228', accent: '#BDE6A8', accentSoft: '#1F3215',
      markBack: '#A8E6D1', markFront: '#62BC9E', markSparkle: '#FFF3C4',
    },
  },
  peach: {
    light: {
      me: '#B74E1A', meBg: '#FAF3EF', mePastelBg: '#EECBBA', meText: '#B74E1A', meFill: '#E58D61',
      partner: '#407749', partnerBg: '#E7F8EA', partnerPastelBg: '#BAEEC2', partnerText: '#407749', partnerFill: '#6EB97B',
      together: '#7A6B1F', togetherBg: '#F8F5E7', togetherPastelBg: '#EEE5BA', togetherText: '#7A6B1F', togetherFill: '#DAC24E',
      primary: '#407749', primaryDark: '#305A37', primaryLight: '#60A96C', primaryFill: '#62B16B', primaryBg: '#E9F7EB', primarySoft: '#E9F7EB',
      coral: '#B74E1A', indigo: '#407749', violet: '#7A6B1F', couple: '#B74E1A', food: '#7A6B1F', health: '#407749',
      secondary: '#407749', secondarySoft: '#E7F8EA', accent: '#7A6B1F', accentSoft: '#F8F5E7',
      markBack: '#9CC9A3', markFront: '#305A37', markSparkle: '#DAC24E',
    },
    dark: {
      me: '#E6BDA8', meBg: '#321F15', mePastelBg: '#321F15', meText: '#E6BDA8', meFill: '#E6BDA8',
      partner: '#A8E6B2', partnerBg: '#15321A', partnerPastelBg: '#15321A', partnerText: '#A8E6B2', partnerFill: '#A8E6B2',
      together: '#E6DBA8', togetherBg: '#322D15', togetherPastelBg: '#322D15', togetherText: '#E6DBA8', togetherFill: '#E6DBA8',
      primary: '#45A154', primaryDark: '#347940', primaryLight: '#62BC71', primaryFill: '#62BC71', primaryBg: '#0F2413', primarySoft: '#0F2413',
      coral: '#E6BDA8', indigo: '#A8E6B2', violet: '#E6DBA8', couple: '#E6BDA8', food: '#E6DBA8', health: '#A8E6B2',
      secondary: '#A8E6B2', secondarySoft: '#15321A', accent: '#E6DBA8', accentSoft: '#322D15',
      markBack: '#A8E6B2', markFront: '#62BC71', markSparkle: '#FFF3C4',
    },
  },
};

/** 변형 × 스킴으로 미리 합쳐 둔 팔레트 — 읽기 경로(프록시·themedStyles)는 여기서 꺼낸다 */
const resolved: Record<AccentVariant, Record<Scheme, Palette>> = {
  green: { light, dark },
  mint: {
    light: { ...light, ...ACCENT_OVERRIDES.mint.light },
    dark: { ...dark, ...ACCENT_OVERRIDES.mint.dark },
  },
  peach: {
    light: { ...light, ...ACCENT_OVERRIDES.peach.light },
    dark: { ...dark, ...ACCENT_OVERRIDES.peach.dark },
  },
};

/** green 팔레트 — 변형과 무관하게 기준값이 필요한 곳(문서·검증 스크립트)용 */
export const palettes: Record<Scheme, Palette> = resolved.green;

/*
 * 현재 스킴 — <b>모듈 수준 가변값</b>이다.
 *
 * 팔레트를 상수로 고정하면(예전 방식) 90개 화면의 StyleSheet 가 시작 시점의 색을
 * 복사해 가버려, 테마를 바꿔도 앱을 다시 열기 전에는 반영되지 않았다.
 * 값을 바꿀 수 있게 두고, 아래 colors 프록시와 themedStyles 가 <b>읽는 시점</b>에
 * 현재 스킴을 참조하게 해서 즉시 전환을 가능하게 한다.
 */
let currentScheme: Scheme = (() => {
  const preferred = readThemeModeSync();
  const resolvedMode = preferred === 'system' ? Appearance.getColorScheme() : preferred;
  return resolvedMode === 'dark' ? 'dark' : 'light';
})();

/* 액센트 변형도 같은 방식 — 웹은 동기 저장소에서 바로 읽고, 네이티브는 themeStore.load 가 덮어쓴다 */
let currentVariant: AccentVariant = readAccentVariantSync();

export function getScheme(): Scheme {
  return currentScheme;
}

/** 스킴 교체 — 화면 갱신은 themeStore 가 맡는다 (여기서는 값만 바꾼다) */
export function setScheme(scheme: Scheme): void {
  currentScheme = scheme;
}

export function getAccentVariant(): AccentVariant {
  return currentVariant;
}

/** 액센트 변형 교체 — 화면 갱신은 themeStore 가 맡는다 */
export function setAccentVariant(variant: AccentVariant): void {
  currentVariant = variant;
}

/** 지금 적용 중인 팔레트(변형 + 스킴). themedStyles 가 스타일을 만들 때 쓴다 */
export function palette(scheme: Scheme = currentScheme): Palette {
  return resolved[currentVariant][scheme];
}

/** 현재 테마가 다크인지 — 지도(웹뷰) 등 팔레트 밖 분기에 사용 */
export function isDarkMode(): boolean {
  return currentScheme === 'dark';
}

/*
 * colors — 속성을 <b>읽을 때</b> 현재 팔레트에서 값을 꺼내는 프록시.
 *
 * 덕분에 JSX 안의 `color={colors.primary}` 같은 인라인 사용은 렌더될 때마다
 * 최신 색을 얻는다. 반면 모듈 최상위의 StyleSheet.create 는 한 번만 평가되므로
 * 그쪽은 themedStyles 로 감싸야 한다.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_target, key: string) => palette()[key as keyof Palette],
  // 스프레드(...colors)나 Object.keys 가 동작하도록 열거도 지원한다
  ownKeys: () => Reflect.ownKeys(light),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
