/**
 * 타이포그래피 프리셋 — "이 자리에 어떤 크기·굵기·행간을 쓸지"를 여기서만 정한다.
 *
 * <p><b>왜 필요한가</b>: 토큰(fontSize)은 있었지만 <b>조합 규칙</b>이 없어서,
 * 같은 위계의 텍스트가 화면마다 달라졌다. 실측:
 * <ul>
 *   <li>섹션 제목이 12/700 · 12/800 · 14/800 · 16/700 · 16/800 다섯 갈래</li>
 *   <li>같은 14px 본문에 행간 20 · 21 · 22 · 24 가 섞이고, 아예 없는 곳도 7군데</li>
 *   <li>굵기는 '800' 이 47%, '400'/'500' 은 0건 — 전부 굵어 위계가 사라짐</li>
 * </ul>
 *
 * <p><b>행간을 프리셋에 넣은 이유</b>: 한국어는 영문보다 넉넉한 행간이 필요한데
 * `lineHeight` 는 빠뜨려도 티가 안 나서 계속 누락됐다. 프리셋에 포함하면
 * 누락 자체가 불가능해진다.
 *
 * <p><b>굵기를 3단계로만 노출하는 이유</b>: 강조 슬롯을 제한해야 위계가 산다.
 * 화면 하나에 볼드가 15~23개씩 있던 것이 문제의 본질이었다.
 *
 * 사용:
 * <pre>
 *   <Text style={type.sectionTitle}>오늘 영양</Text>
 *   <Text style={type.cardBody}>{memo}</Text>
 * </pre>
 */
import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontSize } from './index';
import { themedStyles } from './themedStyles';

export const type = themedStyles((colors) => ({
  /** 화면 제목 — 헤더가 없는(headerShown:false) 루트 화면에서만 */
  screenTitle: {
    fontSize: fontSize.heading,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  /** 섹션 제목 — 카드 묶음 위 소제목 */
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  /** 섹션 라벨 — 목록 위 작은 구분 라벨 (설정·MY 메뉴 등) */
  overline: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  /** 카드 제목 — 리스트 항목의 첫 줄 */
  cardTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  /** 본문 — 자유 입력 텍스트(메모·글). 한국어 기준 1.5배 행간 */
  cardBody: {
    fontSize: fontSize.body,
    fontWeight: '400',
    color: colors.textPrimary,
    lineHeight: 21,
  },
  /** 보조 정보 — 날짜·작성자·부가 설명 */
  cardMeta: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  /** 설명문 — 빈 상태·안내 문구처럼 여러 줄이 되는 텍스트 */
  description: {
    fontSize: fontSize.body,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: 21,
  },
  /** 지표 숫자 — 통계 카드의 큰 값 */
  metricValue: {
    fontSize: fontSize.title,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  /**
   * 지표 단위 — 숫자보다 작고 연하게.
   * 지금은 "1250 kcal" 에서 단위가 숫자와 같은 크기·굵기라 눈이 단위에 먼저 걸린다.
   */
  metricUnit: {
    fontSize: fontSize.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
}));
