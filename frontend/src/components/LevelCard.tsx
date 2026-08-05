/** 레벨 카드 — 칭호 + XP 진행바. XP = 운동일×10 + 식단일×5 (서버 파생 계산) */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { UserLevel } from '../types';
import { themedStyles } from '../theme/themedStyles';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// 레벨 구간별 칭호
const TITLES: { minLevel: number; icon: IconName; title: string }[] = [
  { minLevel: 15, icon: 'crown', title: '전설' },
  { minLevel: 10, icon: 'trophy', title: '헬스왕' },
  { minLevel: 7, icon: 'fire', title: '열정러' },
  { minLevel: 5, icon: 'run', title: '꾸준러' },
  { minLevel: 3, icon: 'leaf', title: '병아리' },
  { minLevel: 1, icon: 'sprout', title: '새싹' },
];

export function levelTitle(level: number) {
  return TITLES.find((t) => level >= t.minLevel) ?? TITLES[TITLES.length - 1];
}

export function LevelCard({ level }: { level: UserLevel }) {
  const { icon, title } = levelTitle(level.level);
  const span = level.nextLevelXp - level.levelStartXp;
  const progress = span > 0 ? (level.xp - level.levelStartXp) / span : 0;
  const remain = level.nextLevelXp - level.xp;

  return (
    <Card elevation="sm" style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons name={icon} size={20} color={colors.primary} />
          </View>
          <View>
            <Text style={styles.levelText}>Lv.{level.level} {title}</Text>
            <Text style={styles.sub}>
              운동 {level.workoutDays}일 · 식단 {level.mealDays}일
            </Text>
          </View>
        </View>
        <Text style={styles.xp}>{level.xp} XP</Text>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.max(4, progress * 100))}%` }]} />
      </View>
      <Text style={styles.next}>다음 레벨까지 {remain} XP — 기록할수록 성장해요!</Text>
    </Card>
  );
}

const styles = themedStyles((colors) => ({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  sub: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  xp: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  next: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center' },
}));
