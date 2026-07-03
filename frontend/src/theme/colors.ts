/**
 * Fitto 컬러 토큰 — 프리미엄 리브랜드.
 * 메인은 차분한 브릭 로즈(#C9504B), 커플/식단/건강은 의미별 액센트로 분리.
 *
 * 아래 "호환 별칭" 섹션은 기존 코드(46개 파일)가 참조하던 키를 새 팔레트로 매핑해
 * 앱 전체가 한 번에 리스킨되도록 한다. (constants/theme.ts 가 이 파일을 re-export)
 */
export const colors = {
  // 브랜드
  primary: '#C9504B',
  primaryLight: '#F5908B',
  primaryBg: '#FFF0EF',

  // 의미별 액센트
  couple: '#FF8080',
  food: '#F0A020',
  health: '#5A9E5A',

  // 텍스트
  textPrimary: '#1A1A18',
  textSecondary: '#5C5B58',
  textMuted: '#9A9894',

  // 표면
  surface: '#FAFAFA',
  surfaceCard: '#FFFFFF',

  // 보더
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.15)',

  // ── 호환 별칭 (기존 키 → 새 팔레트) ─────────────────────────────
  primaryDark: '#A83F3B', // pressed/강조
  primarySoft: '#FFF0EF', // = primaryBg
  secondary: '#5A9E5A', // 운동/건강 → health(green)
  secondarySoft: '#EAF3DE',
  accent: '#F0A020', // 스트릭/포인트 → food(amber)
  accentSoft: '#FAEEDA',
  background: '#FAFAFA', // = surface
  surfaceAlt: '#F4F3F1', // 뉴트럴 alt 표면(칩 등)
  textTertiary: '#9A9894', // = textMuted
  success: '#5A9E5A',
  danger: '#E5484D',
  white: '#FFFFFF',
} as const;
