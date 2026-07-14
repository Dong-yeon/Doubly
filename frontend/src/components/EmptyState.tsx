import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontSize, spacing } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  /** 하위호환: 이모지 문자열을 받아 내부에서 단색 벡터 아이콘으로 매핑한다 */
  emoji?: string;
  /** 명시적 아이콘(우선) */
  icon?: IconName;
  title: string;
  description?: string;
}

/** 이모지 → MaterialCommunityIcons 매핑 (빈 화면의 큰 이모지를 절제된 아이콘으로) */
const EMOJI_ICON: Record<string, IconName> = {
  '💬': 'chat-outline',
  '🍽️': 'silverware-fork-knife',
  '📊': 'chart-box-outline',
  '📝': 'pencil-outline',
  '📖': 'book-open-outline',
  '📈': 'chart-line',
  '🏆': 'trophy-outline',
  '✈️': 'airplane',
  '📍': 'map-marker-outline',
  '📋': 'clipboard-text-outline',
  '👥': 'account-group-outline',
  '💪': 'dumbbell',
};

/** 빈 상태 안내 — 큰 이모지 대신 연한 단색 아이콘으로 절제된 룩 */
export function EmptyState({ emoji, icon, title, description }: Props) {
  const name: IconName = icon ?? (emoji ? EMOJI_ICON[emoji] ?? 'inbox-outline' : 'inbox-outline');
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name={name} size={40} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
});
