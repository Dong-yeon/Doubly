/** 주간 결산 카드 — 지난주(월~일) 운동+식단 요약. 커플이면 함께 일수 + 채팅 공유 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Card } from './Card';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import type { WeeklyRecap } from '../types';

interface Props {
  recap: WeeklyRecap;
  /** 커플 연결 시 채팅 공유 버튼 표시 */
  onShare?: () => void;
  sharing?: boolean;
}

const md = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}.${Number(d)}`;
};

export function WeeklyRecapCard({ recap, onShare, sharing }: Props) {
  return (
    <Card elevation="sm" style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>지난주 결산</Text>
        <Text style={styles.period}>
          {md(recap.weekStart)} ~ {md(recap.weekEnd)}
        </Text>
      </View>

      <Row label="나" workout={recap.myWorkoutDays} meal={recap.myMealDays} dot={colors.me} />
      {recap.coupleConnected ? (
        <>
          <Row
            label={recap.partnerName ?? '상대'}
            workout={recap.partnerWorkoutDays}
            meal={recap.partnerMealDays}
            dot={colors.partner}
          />
          <View style={styles.divider} />
          <Row label="함께" workout={recap.bothWorkoutDays} meal={recap.bothMealDays} highlight dot={colors.together} />
        </>
      ) : null}

      {recap.coupleConnected && onShare ? (
        <TouchableOpacity style={styles.shareBtn} onPress={onShare} disabled={sharing}>
          <Text style={styles.shareText}>{sharing ? '공유 중…' : '채팅에 공유'}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

function Row({
  label,
  workout,
  meal,
  highlight,
  dot,
}: {
  label: string;
  workout: number;
  meal: number;
  highlight?: boolean;
  dot: string;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: dot }]} />
      <Text style={[styles.rowLabel, highlight && { color: dot }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHi]}>{workout}일</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHi]}>{meal}일</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  period: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 9, height: 9, borderRadius: 5 },
  rowLabel: { flex: 1, fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '700' },
  rowValue: { width: 76, textAlign: 'right', fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  rowValueHi: { fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
  shareBtn: {
    marginTop: spacing.xs,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  shareText: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSize.caption },
});
