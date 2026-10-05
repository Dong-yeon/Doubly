/** 뱃지 — 설계서 GAME-04 (7/30/100일 달성). 최고 연속 일수(maxStreak) 기준 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { Card } from './Card';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Badge {
  days: number;
  icon: IconName;
  label: string;
}

// 기본: 운동 뱃지
const WORKOUT_BADGES: Badge[] = [
  { days: 7, icon: 'medal-outline', label: '7일' },
  { days: 30, icon: 'medal', label: '30일' },
  { days: 100, icon: 'trophy', label: '100일' },
];

interface Props {
  /** 최고 연속 일수 — 뱃지를 땄는지의 기준(한 번 딴 뱃지는 유지한다, 2026-10-05 결정) */
  maxStreak: number;
  /**
   * 지금 이어지는 연속 일수 — "다음 뱃지까지 며칠"의 기준. 다음 뱃지는 한 번의 연속으로 채워야 하므로
   * 최고 기록이 아니라 지금 연속에서 센다. 없으면(옛 호출부) 최고 기록으로 센다.
   */
  currentStreak?: number;
  title?: string;
  badges?: Badge[];
}

export function BadgeCard({ maxStreak, currentStreak, title = '뱃지', badges = WORKOUT_BADGES }: Props) {
  const earned = badges.filter((b) => maxStreak >= b.days).length;
  const next = badges.find((b) => maxStreak < b.days);
  /*
   * 예전 문구는 "최고 연속 12일 · 30일 뱃지까지 18일!"이었다 — 이미 끊겨 지금 3일째인 사람은 실제로 27일을
   * 더 해야 하는데 18일로 보였다(docs/my-current-state.md §3-4). 지금 연속에서 세고, 최고 기록은 덧붙인다.
   */
  const current = currentStreak ?? maxStreak;
  const progressText = !next
    ? '모든 뱃지를 달성했어요! '
    : `지금 연속 ${current}일 · ${next.label} 뱃지까지 ${next.days - current}일!`
      + (maxStreak > current ? ` (최고 ${maxStreak}일)` : '');

  return (
    <Card elevation="sm" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>{earned}/{badges.length}</Text>
      </View>

      <View style={styles.row}>
        {badges.map((b) => {
          const unlocked = maxStreak >= b.days;
          return (
            <View key={b.days} style={styles.badge}>
              <View style={[styles.circle, unlocked ? styles.circleOn : styles.circleOff]}>
                <MaterialCommunityIcons
                  name={unlocked ? b.icon : 'lock-outline'}
                  size={unlocked ? 28 : 22}
                  color={unlocked ? colors.achievement : colors.textTertiary}
                />
              </View>
              <Text style={[styles.label, unlocked && styles.labelOn]}>{b.label}</Text>
            </View>
          );
        })}
      </View>

      <Text style={styles.progress}>{progressText}</Text>
    </Card>
  );
}

const styles = themedStyles((colors) => ({
  card: { gap: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  count: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-around' },
  badge: { alignItems: 'center', gap: spacing.xs },
  circle: { width: 60, height: 60, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  circleOn: { backgroundColor: colors.achievementBg, borderWidth: 2, borderColor: colors.achievement },
  circleOff: { backgroundColor: colors.surfaceAlt },
  emoji: { fontSize: 28 },
  emojiOff: { fontSize: 22, opacity: 0.5 },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  labelOn: { color: colors.textPrimary },
  progress: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center' },
}));
