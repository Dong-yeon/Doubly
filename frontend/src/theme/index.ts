/**
 * Doubly 디자인 토큰 진입점. 신규 코드는 `../theme` 에서 임포트한다.
 * (기존 `../constants/theme` 임포트도 이 토큰을 re-export 하므로 동일하게 동작)
 */
export { colors, isDarkMode } from './colors';
export { fonts } from './fonts';
export { spacing, radius } from './spacing';
export { layout } from './layout';

/**
 * 글자 크기 스케일 — 단계마다 약 1.2배.
 *
 * <p><b>고친 것은 단차뿐이다</b>(2026-09-08). 본문 14 와 소제목 16 이 <b>2px</b> 차이라
 * 크기로는 구분이 안 됐고, 굵기 하나가 위계를 다 떠안았다 — {@link ./typography} 가
 * "볼드 47%" 를 정리한 뒤에도 화면이 평평해 보이던 진짜 이유다. 20→26 도 1.30 배로
 * 혼자 튀었다. 두 자리만 벌려 비율을 1.2 안팎으로 맞춘다.
 *
 * <p><b>바닥값(caption 12 · body 14)은 건드리지 않는다.</b> 처음엔 "한글은 라틴보다
 * 획이 빽빽하니 본문을 15 로" 올리는 안을 만들었는데, 모바일에서 전체를 키우는 건
 * 별개 판단이고 요청도 아니었다. <b>위계는 단계 사이의 비율에서 나오지 바닥에서
 * 나오지 않는다</b> — 실제로 14/17(1.21)이 15/18(1.20)보다 오히려 낫다.
 * 절대 크기를 손보고 싶으면 그때는 스케일 상수가 아니라 사용자 설정으로 여는 게 맞다
 * (이 앱은 이미 시스템 글꼴 크기를 따른다 — allowFontScaling 을 끈 곳이 한 곳뿐이다).
 *
 * <p>micro→caption 만 1.09 로 남는데 의도한 것이다. micro 는 탭 라벨·타임스탬프
 * 전용 하한이고 쓰는 곳이 9 곳뿐이라, 벌리려고 caption 을 올리면 411 곳이 따라 움직인다.
 */
export const fontSize = {
  /**
   * caption(12) 아래 단계. 탭 라벨·타임스탬프처럼 정말 작아야 하는 자리에서
   * 10·11 리터럴이 쓰이고 있었다(채팅에만 5곳). 11 로 모아 하한을 명시한다 —
   * 10 은 접근성 최소 권장에 못 미쳐 토큰으로 승격하지 않는다.
   */
  micro: 11,
  /** 보조 정보 — 날짜·작성자·단위. 본문이 아니다(본문이면 body 가 맞다) */
  caption: 12,
  body: 14,
  subtitle: 17,
  title: 21,
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
