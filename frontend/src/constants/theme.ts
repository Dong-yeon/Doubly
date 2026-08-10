/**
 * Doubly 디자인 토큰 (호환 진입점).
 * 실제 토큰 정의는 src/theme 로 이전되었고, 여기서 그대로 re-export 한다.
 * 기존 코드의 `from '../constants/theme'` 임포트를 깨지 않으면서
 * 새 프리미엄 팔레트/폰트를 앱 전체에 적용하기 위한 shim.
 */
export { colors, fonts, spacing, radius, fontSize, shadow } from '../theme';
