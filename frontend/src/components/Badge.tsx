import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, fonts, fontSize, radius, spacing } from '../constants/theme';

type BadgeVariant = 'rose' | 'green' | 'amber' | 'gray';

interface Props {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

/*
 * 함수로 두는 이유: 하드코딩 hex 는 다크에서 흰 덩어리로 남았고(QA_CHECKLIST 패턴 8),
 * 액센트 변형(민트·피치)도 따라오지 않았다. 렌더 시점에 현재 팔레트를 읽는다.
 * green/amber 는 상대/나 계열이 아니라 "상태 색"으로 쓰이므로 의미 토큰(partner/me)의
 * Bg·Text 짝을 빌려 쓴다 — 배지 글자는 그 배경 위에서 4.5 를 넘기도록 이미 맞춰져 있다.
 */
const variantColors = (variant: BadgeVariant): { bg: string; fg: string } =>
  ({
    rose: { bg: colors.dangerBg, fg: colors.dangerText },
    green: { bg: colors.partnerBg, fg: colors.partnerText },
    amber: { bg: colors.meBg, fg: colors.meText },
    gray: { bg: colors.surfaceAlt, fg: colors.textSecondary },
  })[variant];

/** 상태/카테고리 태그 — pill 형태의 작은 배지 */
export function Badge({ label, variant = 'gray', style }: Props) {
  const { bg, fg } = variantColors(variant);
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
