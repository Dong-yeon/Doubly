/**
 * 솔로 픽 뱃지 — 상대는 아직 안 가봤지만(또는 안 매겼지만) 내가 강력 추천(4점 이상)한 장소.
 * 럽슐랭 등급({@link LovelichelinBadge})은 둘 다 평가해야만 매겨지는데, 그러면 "혼자 간
 * 인생 맛집"은 영원히 인정받을 방법이 없다 — 이 뱃지가 그 절반("나만의 미슐랭")을 채운다.
 * 상대가 나중에 방문·평가하면 등급이 매겨지며 이 뱃지는 자연히 사라진다.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  /** 누구의 픽인지 — 색상(나=Gold/상대=Green)으로 구분한다 */
  who: 'me' | 'partner';
  /** 목록 카드처럼 좁은 자리에 쓸 때 */
  size?: 'sm' | 'md';
}

export function SoloPickBadge({ who, size = 'md' }: Props) {
  const small = size === 'sm';
  const label = who === 'me' ? '내 픽' : '상대 픽';
  const tint = who === 'me'
    ? { bg: colors.meBg, text: colors.meText }
    : { bg: colors.partnerBg, text: colors.partnerText };

  return (
    <View style={[styles.badge, small && styles.badgeSm, { backgroundColor: tint.bg }]}>
      <MaterialCommunityIcons name="heart" size={small ? 11 : 13} color={tint.text} />
      <Text style={[styles.text, small && styles.textSm, { color: tint.text }]} numberOfLines={1}>
        {label}
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
  },
  badgeSm: { paddingHorizontal: spacing.xs, paddingVertical: 2 },
  text: { fontSize: fontSize.caption, fontWeight: '800' },
  textSm: { fontSize: fontSize.micro },
}));
