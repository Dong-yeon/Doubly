/**
 * Dubly 팔레트 원본 — <b>값만</b> 담는다. import 가 하나도 없어야 한다.
 *
 * <p>왜 colors.ts 와 나눴나: colors.ts 는 Appearance·AsyncStorage 를 불러 현재 스킴을 고르는
 * 런타임 모듈이라, 안드로이드 홈 위젯(헤드리스 태스크)처럼 그런 의존성을 피해야 하는 곳은
 * 값을 손으로 복사해 쓰다 낡았다(위젯이 구 크림·구 잉크를 쓰고 있었다). 값을 여기 한 곳에 두고
 * colors.ts·widget 이 함께 읽는다. scripts/verify-theme-contrast.mjs 도 이 파일을 텍스트로 읽는다.
 *
 * ── 색의 뜻 (docs/color-redesign-viewer-based_2026-10-05.md) ─────────────
 * 색은 셋만 뜻을 갖는다 — <b>나 = 코랄 · 상대 = 하늘 · 함께 = 라벤더</b>. 앱 아이콘의 두 숟가락
 * (코랄 #F28472 · 하늘 #62A8EC, components/DoublyLogo.tsx)에서 hue 를 땄고 함께는 그 사이다.
 * <b>보는 사람 기준</b>이다 — 내 폰에서 나는 늘 코랄, 같은 사람이 상대 폰에서는 하늘이다.
 *
 * 크롬(버튼·탭·링크·선택 상태)은 <b>잉크(무채색)</b>다. 크롬이 유채색이면 소유자 색 하나와 겹친다 —
 * 2026-10-05 까지 primary #2A7731 과 상대 #2C7D33 이 ΔE 3.1 로 같은 색이라 "앱이 상대 것처럼"
 * 보였다. verify:theme 의 DISTINCT 규칙이 이 겹침을 막는다.
 *
 * 다른 뜻(캘린더 종류·요일·차트·성취·주의·지도)은 아래 목적 토큰을 쓴다 — 소유자 색을 빌려 쓰지 않는다.
 *
 * ── 경위 ─────────────────────────────────────────────────────────
 * Coral/Indigo(원색 빨강+파랑) → 정당 색으로 읽힐 소지 → Gold/Teal → Forest/Cream → Gold/Green/Olive
 * (바탕은 흰색, 색은 액센트에만) → 2026-10-05 아이콘을 따라 코랄/하늘/라벤더 + 잉크 크롬.
 * 정당 색 우려는 채도로 피한다 — 소유자 색은 OKLCH C 0.13~0.15 로 danger(C 0.21)보다 낮고,
 * 면이 큰 자리(…Fill)는 아이콘과 같은 파스텔 톤이다.
 *
 * ── 대비 실측 (WCAG: 텍스트 4.5 · 그래픽 3.0) ──────────────────────
 * 라이트 — 소유자 글자 / surfaceAlt #F1F2F0: 나 4.63 · 상대 4.61 · 함께 4.64, 자기 웰 위 4.78~4.79,
 *   …Fill 위 ink 6.50~6.54, …PastelBg 위 ink 12.6~12.9. primary(잉크) 위 white 17.0.
 * 다크 — 소유자 글자 / surfaceAlt #31332D 8.53~8.56, 자기 웰 위 9.39~9.55. primary #ECEEEA 위 ink 14.6,
 *   표면 위 글자 12.8 — <b>예전 초록 primary 의 다크 4.5 미달(버튼 white 3.97 · 링크 3.75)은 사라졌다.</b>
 * 구분(ΔE) — 나↔상대 89 · 나↔함께 72 · 상대↔함께 30 · 나 글자↔danger 24.
 */

export const light = {
  // ── 코어 ─────────────────────────────────────────────────────
  cream: '#FFFFFF', // (구 크림) 지금은 순백 — 키 이름은 호환을 위해 유지
  ink: '#1A1D1A',

  // ── 소유자 (나/상대/함께) — 글자·아이콘·테두리 ────────────────────
  me: '#B94834',
  meBg: '#FFF3F0',
  partner: '#2470B5',
  partnerBg: '#F0F7FE',
  together: '#815CA8',
  togetherBg: '#F8F3FF',

  /*
   * 채움 전용 — 아바타 채움·완료 칩·내 말풍선처럼 <b>면적이 큰 자리</b>. 위에는 ink 글자(onColor 가 고른다).
   * 글자용(me/partner/together)은 4.5:1 때문에 어둡다 — 그 값을 면에 쓰면 덩어리가 무거워진다
   * (docs/UI_UX_COMPETITIVE_REVIEW_2026-09-22.md §3-3). 아이콘 색과 거의 같은 값이다.
   * 글자 없이 색 점만 놓는 자리(캘린더 마커·그래프 막대)에는 쓰지 않는다 — 바탕 대비가 3:1 에 못 미친다.
   */
  meFill: '#FC7961',
  partnerFill: '#53A5F5',
  togetherFill: '#B78EE6',

  /*
   * 파스텔 서피스 — …Bg 보다 한 단계 짙다. <b>ink 글자 전용</b>(소유자 색 글자를 얹으면 4.5 가 안 나온다).
   */
  mePastelBg: '#FFD5CC',
  partnerPastelBg: '#C9E3FE',
  togetherPastelBg: '#E8D7FE',

  // 소유자 색의 "텍스트용" — 원색이 이미 4.5 를 넘겨 같은 값이다. 호출부 규칙("글자면 …Text")을 위해 키는 둔다
  meText: '#B94834',
  partnerText: '#2470B5',
  togetherText: '#815CA8',
  /*
   * 럽슐랭 등극 왕관 — 트로피 금색. 아이콘이라 비텍스트 3:1(배경 3.12 · 카드 3.25).
   * verify:theme 가 나 색·PRO(primary)·상대 채움과 ΔE 15 이상 떨어져 있는지 본다.
   */
  lovelichelinGold: '#B8860B',

  // ── 크롬 (잉크) — 버튼·활성 탭·링크·선택 상태 ──────────────────
  // 본문 글자와 같은 색이므로 링크·활성 탭은 굵기·막대로 구분한다(MainTabNavigator 참고)
  primary: '#1A1D1A',
  primaryDark: '#0E100E', // 흰 글자를 얹는 진한 면(운동 요약 카드)
  primaryLight: '#585E58',
  /** 크롬 채움 — 주 버튼·활성 칩. 위 글자는 onColor 가 고른다(→ white 17.0) */
  primaryFill: '#1A1D1A',
  /** 선택 칩·soft 버튼 바탕 — 비선택(surfaceAlt)과는 테두리가 구분을 맡는다(1.16) */
  primaryBg: '#E0E2DE',
  primarySoft: '#E0E2DE', // = primaryBg
  /**
   * primary 를 <b>면으로</b> 칠한 자리(배지·전송 버튼·오늘 표시) 위의 글자·아이콘. 라이트는 흰색이지만
   * 다크의 primary 는 밝은 잉크라 흰 글자가 1.2:1 로 사라진다 — 그래서 colors.white 대신 이것을 쓴다.
   */
  onPrimary: '#FFFFFF',

  // ── 텍스트 ───────────────────────────────────────────────────
  textPrimary: '#1A1D1A',
  // WCAG AA(4.5:1) — 가장 어두운 배경인 세그먼트 트랙(surfaceAlt #F1F2F0) 위에서도
  // 통과해야 한다. background 6.37 · surface 6.65 · surfaceAlt 5.92.
  textSecondary: '#585E58',
  textMuted: '#767C76',
  textTertiary: '#767C76',

  // ── 표면 ─────────────────────────────────────────────────────
  // background 를 살짝 낮춰야 흰 카드가 바탕에서 분리된다(그림자만으로는 약하다).
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceAlt: '#F1F2F0',
  background: '#FAFAF9',

  // ── 보더 ─────────────────────────────────────────────────────
  border: '#E4E6E3',
  borderStrong: 'rgba(26,29,26,0.15)',

  // 모달·시트 뒤에 까는 어둡게 덮개. 다크에서는 더 진하게 해야 시트와 배경이 분리된다.
  backdrop: 'rgba(0,0,0,0.42)',

  // PC(웹)에서 앱 셸 <b>바깥</b>에 깔리는 바탕 — 셸보다 한 단계 어둡게(components/AppShell.web.tsx)
  shellBackdrop: '#EDEEEB',

  // ── 목적 토큰 — 소유자 색과 무관한 뜻 ─────────────────────────────
  /** 캘린더 일정 종류 — 결정 D3 로 예전 값 유지 */
  eventAnniversary: '#59772D',
  eventBirthday: '#8A6817',
  eventDate: '#2C7D33',
  /** 성취 — PR·목표 카드, 스트릭 불꽃, 배지. 누가 했든 같은 금색 */
  achievement: '#8A6817',
  achievementBg: '#F6E2B2', // 위에는 ink 글자
  /** 주의 — 장애 공지 배너, 원판 계산 나머지 */
  warning: '#8A6817',
  warningBg: '#FBF3DF',
  /** 달력 요일 — 관행(일 빨강·토 파랑). 토요일 값은 상대 색과 같지만 키는 별개다 */
  sunday: '#E12D33', // = danger
  saturday: '#2470B5',
  /** 차트 계열 — 서로 ΔE ≥ 45, 소유자 색과 ≥ 32. 카드 위 4.4 이상 */
  chart1: '#1A1D1A',
  chart2: '#1E7F86',
  chart3: '#A86A12',
  chart4: '#2C7D33',
  /** 입력 별점(만족도) — 럽슐랭의 나/상대 별은 소유자 색 그대로 */
  rating: '#B8860B',
  /** 지도 핀·경로 — 럽슐랭·사진 지도는 "우리" 것 */
  mapPin: '#815CA8',
  /** 강조 카드 바탕(프로그램·추천 카드) — 중립 웜그레이, 위에는 ink */
  highlightBg: '#F3F1EC',

  // ── 기능색 ───────────────────────────────────────────────────
  // 체크·완료 — 크롬이 잉크라 앱 안의 초록은 이것뿐이다
  success: '#1E8652', // white 위 4.58
  successBg: '#E7F5EE',
  danger: '#E12D33', // white 위 4.54 — 나 글자(#B94834)와 ΔE 24
  // danger 의 배지용 짝 — 연한 배경 + 그 위에서 4.5 를 넘기는 어두운 글자
  dangerBg: '#FFF0EF',
  dangerText: '#9B3330',
  white: '#FFFFFF',
};

/**
 * 다크 팔레트 — 같은 키, 반전된 명도.
 * - 배경/표면: <b>중립 차콜</b> (#1E201C → #262823 → #31332D).
 * - 소유자 색은 파스텔 — 어두운 배경 위라 밝을수록 대비가 오른다. 채움·글자가 같은 값이고 위에는 onColor 의 어두운 글자.
 * - white 는 "색 위에 얹는 텍스트" 용도라 유지
 */
export const dark: typeof light = {
  cream: '#FFFFFF',
  ink: '#ECEEEA',

  me: '#FEC6BB',
  meBg: '#3D241F',
  partner: '#B2D7FF',
  partnerBg: '#1C2D3F',
  together: '#E1C9FF',
  togetherBg: '#30263B',

  meFill: '#FEC6BB',
  partnerFill: '#B2D7FF',
  togetherFill: '#E1C9FF',

  // 다크는 …Bg 가 이미 짙은 웰이라 그대로 재사용 — 텍스트(ink)가 밝아 대비가 넉넉하다
  mePastelBg: '#3D241F',
  partnerPastelBg: '#1C2D3F',
  togetherPastelBg: '#30263B',

  meText: '#FEC6BB',
  partnerText: '#B2D7FF',
  togetherText: '#E1C9FF',
  // 럽슐랭 등극 왕관 — 선명한 금색. 배경 10.08 · 카드 9.14
  lovelichelinGold: '#F5C518',

  // 크롬 — 밝은 잉크. 버튼(위에 어두운 글자 14.6)과 링크 글자(표면 위 12.8)를 둘 다 만족한다
  primary: '#ECEEEA',
  primaryDark: '#3A3D36', // 흰 글자를 얹는 면 — 다크에서는 표면보다 한 단계 밝은 차콜
  primaryLight: '#C9CCC6',
  primaryFill: '#ECEEEA',
  primaryBg: '#40433C', // 위 primary 글자 8.62
  primarySoft: '#40433C',
  onPrimary: '#1A1D1A', // 밝은 잉크 위 — 14.6

  textPrimary: '#ECEEEA',
  textSecondary: '#A8AEA6', // background 7.25 · surface 6.57 · surfaceAlt 5.65
  textMuted: '#868C84',
  textTertiary: '#868C84',

  surface: '#262823',
  surfaceCard: '#262823',
  surfaceAlt: '#31332D',
  background: '#1E201C',

  border: '#3A3D36',
  borderStrong: 'rgba(236,238,234,0.18)',

  backdrop: 'rgba(0,0,0,0.62)',

  // background(#1E201C)보다 어둡다 — "셸이 바탕 위에 떠 있다"는 관계를 라이트와 맞춘다
  shellBackdrop: '#141613',

  eventAnniversary: '#C9DA97',
  eventBirthday: '#F1C999',
  eventDate: '#A7D2A9',
  achievement: '#F1C999',
  achievementBg: '#332811',
  warning: '#F1C999',
  warningBg: '#332811',
  sunday: '#F25A5F', // = danger
  saturday: '#B2D7FF',
  chart1: '#ECEEEA',
  chart2: '#7FD3D9',
  chart3: '#F0B567',
  chart4: '#A7D2A9',
  rating: '#F5C518',
  mapPin: '#E1C9FF',
  highlightBg: '#2E2C27',

  success: '#3FBF80',
  successBg: '#1C3327',
  danger: '#F25A5F', // surface 위 4.54
  dangerBg: '#3A1F20',
  dangerText: '#F2A0A0',
  white: '#FFFFFF',
};

export type Palette = typeof light;
export type Scheme = 'light' | 'dark';

/** 스킴별 원본(잉크 크롬) — 위젯·게임판처럼 테마를 따르지 않는 자리와 검증 스크립트용 */
export const palettes: Record<Scheme, Palette> = { light, dark };

/*
 * ── 포인트 색 테마 (사용자 선택, 2026-10-06) ─────────────────────────────
 * 설정 > 화면 > 포인트 색. <b>크롬(primary 계열)만</b> 갈아끼운다 — 나/상대/함께·목적 토큰은 그대로다.
 * 2026-10-05 에 폐지한 액센트 변형은 소유자 색까지 바꿨다. 이것은 다르다: 색의 뜻은 고정하고
 * "검은 버튼이 싫을 수 있다"는 취향만 연다(docs/color-redesign-viewer-based_2026-10-05.md §11).
 *
 * 후보는 무채색·저채도뿐이다 — 코랄·하늘·보라·초록은 나/상대/함께/완료가 쓴다. verify:theme 가
 * 테마 × 스킴마다 대비와 "primary ≠ 소유자 색"(ΔE 15)을 본다.
 *
 *   primary      글자·테두리·탭 활성 — 바탕 위 4.5 이상
 *   primaryFill  버튼·활성 칩 채움 — 위 글자는 onColor 가 고른다
 *   primaryBg    선택 칩 바탕 — 위 primary 글자 4.5 이상
 *   primaryDark  흰 글자를 얹는 진한 면(운동 요약 카드)
 *   primaryLight 다크에서 primaryBg 위 밝은 글자(주간 리캡 공유 알약)
 *   onPrimary    primary 면 위 글자
 *
 * 새 테마를 넣을 때는 light·dark 를 <b>둘 다, 일곱 키 모두</b> 채운다(Record 라 컴파일러가 잡는다).
 */
export type ChromeKey = 'primary' | 'primaryDark' | 'primaryLight' | 'primaryFill' | 'primaryBg' | 'primarySoft' | 'onPrimary';
export type ChromeTheme = { id: string; label: string; light: Record<ChromeKey, string>; dark: Record<ChromeKey, string> };

const chrome = (
  primary: string, primaryDark: string, primaryLight: string, primaryFill: string, primaryBg: string, onPrimary: string,
): Record<ChromeKey, string> => ({ primary, primaryDark, primaryLight, primaryFill, primaryBg, primarySoft: primaryBg, onPrimary });

export const CHROME_THEMES = [
  {
    id: 'ink',
    label: '잉크',
    light: chrome('#1A1D1A', '#0E100E', '#585E58', '#1A1D1A', '#E0E2DE', '#FFFFFF'),
    dark: chrome('#ECEEEA', '#3A3D36', '#C9CCC6', '#ECEEEA', '#40433C', '#1A1D1A'),
  },
  {
    id: 'slate',
    label: '슬레이트',
    light: chrome('#334155', '#1E293B', '#64748B', '#334155', '#E2E8F0', '#FFFFFF'),
    dark: chrome('#CBD5E1', '#3A4352', '#E2E8F0', '#CBD5E1', '#3A4352', '#1A1D1A'),
  },
  {
    id: 'deepSlate',
    label: '딥 슬레이트',
    light: chrome('#283341', '#18202B', '#5B6878', '#283341', '#E1E6EC', '#FFFFFF'),
    dark: chrome('#D5DCE5', '#38414D', '#E5E9EF', '#D5DCE5', '#38414D', '#1A1D1A'),
  },
  {
    id: 'graphite',
    label: '그래파이트',
    light: chrome('#3B3F45', '#26292E', '#6B7078', '#3B3F45', '#E3E5E8', '#FFFFFF'),
    dark: chrome('#DDE0E4', '#3F444B', '#ECEEF0', '#DDE0E4', '#3F444B', '#1A1D1A'),
  },
  {
    id: 'stone',
    label: '스톤',
    light: chrome('#44403C', '#292524', '#78716C', '#44403C', '#E8E5E1', '#FFFFFF'),
    dark: chrome('#E7E5E4', '#45403B', '#F0EEED', '#E7E5E4', '#45403B', '#1A1D1A'),
  },
  /*
   * 밝은 버튼(2026-10-06 사용자 요청) — 채움은 파스텔(위 글자는 onColor → 잉크 11 이상), 글자·탭은 같은 hue 의
   * 진한 값. 코랄·하늘·보라·초록 계열은 나/상대/함께/완료와 겹쳐 뺐고, 머스터드는 성취 금색과 ΔE 11 이라 뺐다.
   */
  {
    id: 'mint',
    label: '민트',
    light: chrome('#007A61', '#006550', '#7BE6C6', '#7BE6C6', '#DBF5EC', '#FFFFFF'),
    dark: chrome('#95DBC4', '#375E52', '#CBF2E4', '#95DBC4', '#1E3C33', '#1A1D1A'),
  },
  {
    id: 'teal',
    label: '틸',
    light: chrome('#047879', '#006363', '#77E3E3', '#77E3E3', '#D8F5F5', '#FFFFFF'),
    dark: chrome('#93D9D8', '#315E5E', '#CAF1F0', '#93D9D8', '#193C3C', '#1A1D1A'),
  },
  {
    id: 'rose',
    label: '로즈',
    light: chrome('#A34E72', '#8F3C60', '#FEC2D8', '#FEC2D8', '#FFE7EF', '#FFFFFF'),
    dark: chrome('#FEBAD3', '#6C4A57', '#FFDDE9', '#FEBAD3', '#462D36', '#1A1D1A'),
  },
  {
    id: 'lime',
    label: '라임',
    light: chrome('#587503', '#486100', '#BCDF7D', '#BCDF7D', '#EAF2DD', '#FFFFFF'),
    dark: chrome('#BDD694', '#4F5A3B', '#E0EFC9', '#BDD694', '#313922', '#1A1D1A'),
  },
  {
    id: 'sand',
    label: '샌드',
    light: chrome('#7C674B', '#6A5539', '#E7CFAF', '#E7CFAF', '#FBECD9', '#FFFFFF'),
    dark: chrome('#DCCBB5', '#665135', '#F0E6DA', '#DCCBB5', '#42321D', '#1A1D1A'),
  },
  {
    id: 'sage',
    label: '세이지',
    light: chrome('#55725A', '#435F48', '#BADABF', '#BADABF', '#E1F5E4', '#FFFFFF'),
    dark: chrome('#BCD3C0', '#415D47', '#DFECE1', '#BCD3C0', '#263B2A', '#1A1D1A'),
  },
  {
    id: 'lilac',
    label: '라일락',
    light: chrome('#686882', '#56566F', '#D0D0ED', '#D0D0ED', '#ECEDFF', '#FFFFFF'),
    dark: chrome('#CBCBDF', '#53526B', '#E6E7F2', '#CBCBDF', '#333349', '#1A1D1A'),
  },
  {
    id: 'silver',
    label: '실버',
    light: chrome('#5E6C7C', '#4C5A69', '#CDD3DA', '#CDD3DA', '#E9EFF6', '#FFFFFF'),
    dark: chrome('#C9CED2', '#50565C', '#E5E8EB', '#C9CED2', '#31363B', '#1A1D1A'),
  },
  {
    id: 'warmSilver',
    label: '웜실버',
    light: chrome('#79675A', '#665548', '#DBD1CA', '#DBD1CA', '#F6ECE5', '#FFFFFF'),
    dark: chrome('#D2CCC6', '#5C534D', '#EBE7E4', '#D2CCC6', '#3B342E', '#1A1D1A'),
  },
] as const satisfies readonly ChromeTheme[];

export type ChromeThemeId = (typeof CHROME_THEMES)[number]['id'];
export const DEFAULT_CHROME_THEME: ChromeThemeId = 'ink';
export const isChromeThemeId = (v: unknown): v is ChromeThemeId => CHROME_THEMES.some((t) => t.id === v);
