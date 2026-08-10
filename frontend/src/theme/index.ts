/**
 * Doubly 디자인 토큰 진입점. 신규 코드는 `../theme` 에서 임포트한다.
 * (기존 `../constants/theme` 임포트도 이 토큰을 re-export 하므로 동일하게 동작)
 */
export { colors } from './colors';
export { fonts } from './fonts';
export { spacing, radius } from './spacing';

export const fontSize = {
  caption: 12,
  body: 14,
  subtitle: 16,
  title: 20,
  heading: 26,
  display: 32,
} as const;

/** 뉴트럴 프리미엄 그림자 (iOS/Android/web). */
export const shadow = {
  sm: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
} as const;
