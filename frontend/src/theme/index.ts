/**
 * Fitto 디자인 토큰 진입점. 신규 코드는 `../theme` 에서 임포트한다.
 * (기존 `../constants/theme` 임포트도 이 토큰을 re-export 하므로 동일하게 동작)
 */
export { colors } from './colors';
export { fonts } from './fonts';
export { spacing, radius } from './spacing';
export { layout } from './layout';

export const fontSize = {
  /**
   * caption(12) 아래 단계. 탭 라벨·타임스탬프처럼 정말 작아야 하는 자리에서
   * 10·11 리터럴이 쓰이고 있었다(채팅에만 5곳). 11 로 모아 하한을 명시한다 —
   * 10 은 접근성 최소 권장에 못 미쳐 토큰으로 승격하지 않는다.
   */
  micro: 11,
  caption: 12,
  body: 14,
  subtitle: 16,
  title: 20,
  heading: 26,
  display: 32,
} as const;

/**
 * 아이콘 크기 스케일.
 *
 * 실측 결과 17·18·20·22·24·26·30·40 여덟 종류가 근거 없이 흩어져 있었다.
 * 역할별로 이름을 주면 "이 자리에 몇 px 이 맞나"를 매번 다시 정하지 않아도 된다.
 */
export const iconSize = {
  /** 텍스트 옆 인라인 아이콘 */
  inline: 18,
  /** 폼 필드·리스트 행 */
  md: 20,
  /** 탭바·헤더 등 주요 내비게이션 */
  nav: 24,
  /** 강조 액션 (FAB 등) */
  lg: 30,
  /** 빈 상태 일러스트 */
  empty: 40,
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
