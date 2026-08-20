/**
 * 럽슐랭 등급 뱃지 — 1~3 럽스타. tier가 0(후보/일반 또는 탈락)이면 아무것도 렌더링하지
 * 않는다(호출부에서 조건 분기 없이 그냥 붙여 써도 되게).
 *
 * <p>등급→라벨 매핑은 {@link LevelCard}의 `TITLES` 배열+`.find()` 패턴을 그대로 따른다.
 * 별 표시는 새 아이콘을 추가하는 대신 PlaceDetailScreen 의 `stars()` 텍스트(★☆) 관례를 쓴다.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const TIERS: { tier: number; label: string }[] = [
  { tier: 3, label: '3 럽스타' },
  { tier: 2, label: '2 럽스타' },
  { tier: 1, label: '1 럽스타' },
];

/** 등급 라벨 — 목록 카드처럼 뱃지 없이 텍스트만 필요한 곳에서 재사용 */
export function lovelichelinLabel(tier: number): string | null {
  return TIERS.find((t) => t.tier === tier)?.label ?? null;
}

interface Props {
  tier: number;
  /** 목록 카드처럼 좁은 자리에 쓸 때 */
  size?: 'sm' | 'md';
}

export function LovelichelinBadge({ tier, size = 'md' }: Props) {
  const label = lovelichelinLabel(tier);
  if (!label) return null;
  const small = size === 'sm';

  return (
    <View style={[styles.badge, small && styles.badgeSm]}>
      <MaterialCommunityIcons name="crown" size={small ? 12 : 14} color={colors.togetherText} />
      <Text style={[styles.text, small && styles.textSm]} numberOfLines={1}>
        {'★'.repeat(tier)} {label}
      </Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.togetherBg,
  },
  badgeSm: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  text: { fontSize: fontSize.caption, fontWeight: '800', color: colors.togetherText },
  textSm: { fontSize: fontSize.micro },
}));
