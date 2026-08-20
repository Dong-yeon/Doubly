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
import { readThemeModeSync } from './themePreference';

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
  // success 의 연한 배경 — 정산 완료 배너 등. 하드코딩 민트(#E7F5EE)가
  // 다크모드에서 흰 덩어리로 남던 것을 토큰으로 흡수했다
  successBg: '#E7F5EE',
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

  // 라이트보다 진하게 — 어두운 배경 위 검은 덮개는 분리감이 약하다
  backdrop: 'rgba(0,0,0,0.62)',

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
  danger: '#F2555A',
  white: '#FFFFFF',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

export const palettes: Record<Scheme, Palette> = { light, dark };

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
  const resolved = preferred === 'system' ? Appearance.getColorScheme() : preferred;
  return resolved === 'dark' ? 'dark' : 'light';
})();

export function getScheme(): Scheme {
  return currentScheme;
}

/** 스킴 교체 — 화면 갱신은 themeStore 가 맡는다 (여기서는 값만 바꾼다) */
export function setScheme(scheme: Scheme): void {
  currentScheme = scheme;
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
  get: (_target, key: string) => palettes[currentScheme][key as keyof Palette],
  // 스프레드(...colors)나 Object.keys 가 동작하도록 열거도 지원한다
  ownKeys: () => Reflect.ownKeys(light),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
