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
  danger: '#F2555A',
  white: '#FFFFFF',
};

/** 현재 시스템 테마가 다크인지 — 지도(웹뷰) 등 팔레트 밖 분기에 사용 */
export const isDarkMode = Appearance.getColorScheme() === 'dark';

export const colors = isDarkMode ? dark : light;
