import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { fonts, fontSize, radius, spacing } from '../constants/theme';

type BadgeVariant = 'rose' | 'green' | 'amber' | 'gray';

interface Props {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const VARIANTS: Record<BadgeVariant, { bg: string; fg: string }> = {
  rose: { bg: '#FFF0EF', fg: '#9B3330' },
  green: { bg: '#EAF3DE', fg: '#27500A' },
  amber: { bg: '#FAEEDA', fg: '#633806' },
  gray: { bg: '#F1F0EE', fg: '#5C5B58' },
};

/** 상태/카테고리 태그 — pill 형태의 작은 배지 */
export function Badge({ label, variant = 'gray', style }: Props) {
  const { bg, fg } = VARIANTS[variant];
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
});
