import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '../constants/theme';

interface Props extends ViewProps {
  /** 그림자 강도 */
  elevation?: 'none' | 'sm' | 'md';
  /**
   * 배경 틴트 — <b>의미</b>로 고른다.
   *
   * <p>예전 이름(`pink`/`mint`/`yellow`)은 실제 색과 달랐다. 팔레트를 Doubly 로
   * 바꾸면서 값만 갈아끼우고 이름은 그대로 둔 탓에, `tint="pink"` 를 쓰면 회색이,
   * `yellow` 를 쓰면 보라가 나왔다. 색 이름 대신 역할 이름을 쓰면 팔레트가 또
   * 바뀌어도 호출부가 거짓말을 하지 않는다.
   */
  tint?: 'surface' | 'neutral' | 'partner' | 'together';
  style?: ViewStyle;
}

const TINTS = {
  surface: colors.surfaceCard,
  /** 중립 강조 — 소유자와 무관한 카드 */
  neutral: colors.primaryBg,
  /** 상대(Indigo) 계열 배경 */
  partner: colors.secondarySoft,
  /** 함께(Violet) 계열 배경 */
  together: colors.accentSoft,
};

/** 둥근 모서리 + 부드러운 그림자 카드 (radius 16 · 얇은 뉴트럴 보더 · elevation 2) */
export function Card({ elevation = 'sm', tint = 'surface', style, children, ...rest }: Props) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: TINTS[tint] },
        elevation !== 'none' && shadow[elevation],
        tint === 'surface' && styles.bordered,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bordered: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
