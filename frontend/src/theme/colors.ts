/**
 * Doubly 컬러 토큰 — Duo Color System.
 * 크롬(버튼·탭·링크)은 Ink 단색, 데이터는 색으로 소유자를 구분한다:
 *   나 = Coral, 상대 = Indigo, 함께 = Violet.
 * 배경은 순백 대신 Cream, 텍스트는 검정 대신 Ink.
 *
 * 아래 "호환 별칭"은 기존 코드(수십 개 파일)가 참조하던 키를 새 팔레트로 매핑해
 * 앱 전체가 한 번에 리스킨되도록 한다. (constants/theme.ts 가 이 파일을 re-export)
 *
 * ── 다크모드 ─────────────────────────────────────────────────────
 * 시스템 테마(Appearance)를 따라 앱 시작 시 팔레트를 고른다.
 * 모든 화면의 StyleSheet 가 모듈 로드 시점에 이 값으로 만들어지므로,
 * 실행 중 시스템 테마를 바꾸면 앱을 다시 시작해야 반영된다 (재실행 시 자동 적용).
 * 브랜드 색(Coral/Indigo/Violet)은 두 테마에서 동일하고, 배경·표면·텍스트만 반전된다.
 */
import { Appearance } from 'react-native';
import { readThemeModeSync } from './themePreference';

const light = {
  // ── Doubly 코어 ──────────────────────────────────────────────
  cream: '#FBF8F3',
  ink: '#14162B',
  coral: '#FF6A4D', // 나
  indigo: '#4A5BFF', // 상대
  violet: '#9B57FF', // 함께

  // ── Duo 시맨틱 (나/상대/함께) ─────────────────────────────────
  me: '#FF6A4D',
  meBg: '#FFF0EC',
  partner: '#4A5BFF',
  partnerBg: '#EEF0FF',
  together: '#9B57FF',
  togetherBg: '#F5EDFF',

  /*
   * ── 소유자 색의 "텍스트용" 변형 ──────────────────────────────
   *
   * 브랜드 원색은 채도가 높아 흰/크림 배경 위 <b>텍스트</b>로 쓰면 대비가 모자란다.
   *   coral  on white 2.83:1 · on meBg 2.55:1
   *   violet on white 4.04:1 · on togetherBg 3.55:1   (WCAG AA 는 4.5:1)
   * 원색을 낮추면 브랜드 톤이 바뀌므로, 배경·아이콘·그래프에는 원색을 그대로 두고
   * <b>읽어야 하는 글자</b>에만 이 어두운 변형을 쓴다.
   *
   * indigo(#4A5BFF)는 흰 배경 4.96:1 로 이미 통과해 원색과 같은 값을 유지한다 —
   * 호출부가 "텍스트면 …Text" 하나로 일관되게 쓸 수 있도록 키는 만들어 둔다.
   */
  meText: '#C43A1E', // white 5.02 · meBg 4.52
  partnerText: '#3B49D8', // white 5.51 · partnerBg 4.96
  togetherText: '#7433D6', // white 5.24 · togetherBg 4.61

  // ── 크롬 (Ink) — 버튼·활성탭·링크 ─────────────────────────────
  primary: '#14162B',
  primaryDark: '#05061A',
  primaryLight: '#3A3D55',
  primaryBg: '#ECECF1',

  // ── 텍스트 ───────────────────────────────────────────────────
  textPrimary: '#14162B',
  // WCAG AA(4.5:1) — 가장 어두운 배경인 세그먼트 트랙(surfaceAlt #F2EEE7) 위에서도
  // 통과해야 한다. 이전 #6B7080 은 흰 배경 4.94 로 합격이었지만 트랙 위 4.27 로 미달.
  textSecondary: '#62687A', // white 5.55 · background 5.24 · surfaceAlt 4.80
  textMuted: '#9A98A4',

  // ── 표면 ─────────────────────────────────────────────────────
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceAlt: '#F2EEE7',
  background: '#FBF8F3',

  // ── 보더 ─────────────────────────────────────────────────────
  border: '#E4DFD6',
  borderStrong: 'rgba(20,22,43,0.15)',

  // 모달·시트 뒤에 까는 어둡게 덮개. 화면마다 rgba(0,0,0,0.4~0.45) 를 직접 쓰다 보니
  // 값이 갈렸다. 다크에서는 이미 어두운 배경 위에 얹는 것이라 더 진하게 해야
  // 시트와 배경이 분리돼 보인다(아래 dark 참고).
  backdrop: 'rgba(0,0,0,0.42)',

  // ── 호환 별칭 (기존 키 → Doubly 팔레트) ───────────────────────
  couple: '#FF6A4D', // 커플 대표 → coral
  food: '#9B57FF', // (구 amber) → violet
  health: '#4A5BFF', // (구 green) → indigo
  primarySoft: '#ECECF1', // = primaryBg
  secondary: '#4A5BFF', // 보조 액센트 → indigo
  secondarySoft: '#EEF0FF',
  accent: '#9B57FF', // 하이라이트/포인트 → violet
  accentSoft: '#F5EDFF',
  textTertiary: '#9A98A4',
  success: '#2FA36B', // 기능색(체크·완료)은 그린 유지
  // success 의 연한 배경 — 정산 완료 배너 등. 하드코딩 민트(#E7F5EE)가
  // 다크모드에서 흰 덩어리로 남던 것을 토큰으로 흡수했다
  successBg: '#E7F5EE',
  danger: '#E5484D',
  white: '#FFFFFF',
};

/**
 * 다크 팔레트 — 같은 키, 반전된 명도.
 * - 배경/표면: Ink 계열 남색 (#101220 → #1B1D2E → #232538)
 * - 크롬: 어두운 배경에서 Ink 가 안 보이므로 Indigo 계열로 대체
 *   (colors.primary 위에 white 텍스트를 얹는 기존 스타일이 그대로 성립해야 한다)
 * - 소유자 색(Coral/Indigo/Violet)은 어두운 배경 대비를 위해 한 단계 밝게,
 *   연한 배경(…Bg/…Soft)은 어둡게. white 는 "색 위에 얹는 텍스트" 용도라 유지
 */
const dark: typeof light = {
  cream: '#FBF8F3',
  ink: '#F2F1F7',
  coral: '#FF7A5E',
  indigo: '#7C88FF',
  violet: '#B07EFF',

  me: '#FF7A5E',
  meBg: '#3A241E',
  partner: '#7C88FF',
  partnerBg: '#20243D',
  together: '#B07EFF',
  togetherBg: '#2C2340',

  /*
   * 다크에서는 원색이 이미 어두운 배경 위 5~7:1 로 통과한다(coral 7.26 · indigo 5.41 ·
   * violet 5.77). 여기서 더 어둡게 만들면 오히려 대비가 나빠지므로 원색을 그대로 쓴다 —
   * 라이트와 키 이름을 맞춰 호출부가 테마를 신경 쓰지 않게 한다.
   */
  meText: '#FF7A5E',
  partnerText: '#7C88FF',
  togetherText: '#B07EFF',

  primary: '#5B6BFF',
  primaryDark: '#4A5BFF',
  primaryLight: '#8A93FF',
  primaryBg: '#242741',

  textPrimary: '#F2F1F7',
  textSecondary: '#A7ACC0', // background #101220 위 7.8:1 · surfaceAlt #232538 위 5.9:1
  textMuted: '#6F7488',

  surface: '#1B1D2E',
  surfaceCard: '#1B1D2E',
  surfaceAlt: '#232538',
  background: '#101220',

  border: '#32354A',
  borderStrong: 'rgba(242,241,247,0.18)',

  // 라이트보다 진하게 — 어두운 배경 위 검은 덮개는 분리감이 약하다
  backdrop: 'rgba(0,0,0,0.62)',

  couple: '#FF7A5E',
  food: '#B07EFF',
  health: '#7C88FF',
  primarySoft: '#242741',
  secondary: '#7C88FF',
  secondarySoft: '#20243D',
  accent: '#B07EFF',
  accentSoft: '#2C2340',
  textTertiary: '#6F7488',
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
