import React from 'react';
import { StyleSheet, View, ViewProps, ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing } from '../constants/theme';

interface Props extends ViewProps {
  /** 그림자 강도 */
  elevation?: 'none' | 'sm' | 'md';
  /** 배경 틴트 */
  tint?: 'surface' | 'pink' | 'mint' | 'yellow';
  style?: ViewStyle;
}

const TINTS = {
  surface: colors.surfaceCard,
  pink: colors.primaryBg,
  mint: colors.secondarySoft,
  yellow: colors.accentSoft,
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
