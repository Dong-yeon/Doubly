/**
 * Doubly 컬러 토큰 — Duo Color System.
 * 크롬(버튼·탭·링크)은 Ink 단색, 데이터는 색으로 소유자를 구분한다:
 *   나 = Coral, 상대 = Indigo, 함께 = Violet.
 * 배경은 순백 대신 Cream, 텍스트는 검정 대신 Ink.
 *
 * 아래 "호환 별칭"은 기존 코드(수십 개 파일)가 참조하던 키를 새 팔레트로 매핑해
 * 앱 전체가 한 번에 리스킨되도록 한다. (constants/theme.ts 가 이 파일을 re-export)
 */
export const colors = {
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
} as const;
