/** 운동 통계 — 설계서 WORKOUT-07 (주간/월간 · 최근 7일 · 부위별) */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { workoutApi } from '../../api/workout';
import type { WorkoutStats } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

const CAT_COLORS: Record<string, string> = {
  근력: colors.primary,
  유산소: colors.secondary,
  유연성: colors.accent,
};

export function WorkoutStatsScreen() {
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      workoutApi
        .stats()
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => setLoaded(true));
    }, []),
  );

  const maxCat = Math.max(1, ...(stats?.categoryBreakdown.map((c) => c.count) ?? [1]));

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* 요약 카드 3개 */}
        <View style={styles.summaryRow}>
          {/*
            셋 다 "내 기록"이라 같은 톤으로 둔다. 예전엔 Ink→Indigo(상대)→Violet(함께) 로
            흘러서, 소유자 색 규칙을 아는 사용자에게는 없는 의미를 만들어 보였다.
          */}
          <SummaryCard label="이번 주" value={stats?.weeklyDays ?? 0} unit="일" tint="neutral" />
          <SummaryCard label="이번 달" value={stats?.monthlyDays ?? 0} unit="일" tint="neutral" />
          <SummaryCard label="누적" value={stats?.totalDays ?? 0} unit="일" tint="neutral" />
        </View>

        {/* 최근 7일 */}
        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionTitle}>최근 7일</Text>
          <View style={styles.weekRow}>
            {stats?.last7Days.map((d) => (
              <View key={d.date} style={styles.dayCol}>
                <View style={[styles.dayDot, d.completed && styles.dayDotDone]}>
                  {d.completed ? <Text style={styles.check}>✓</Text> : null}
                </View>
                <Text style={styles.dayLabel}>{d.weekday}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* 부위별 (최근 30일) */}
        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionTitle}>부위별 (최근 30일)</Text>
          {stats && stats.categoryBreakdown.length > 0 ? (
            stats.categoryBreakdown.map((c) => (
              <View key={c.category} style={styles.catRow}>
                <Text style={styles.catName}>{c.category}</Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(c.count / maxCat) * 100}%`, backgroundColor: CAT_COLORS[c.category] ?? colors.primary },
                    ]}
                  />
                </View>
                <Text style={styles.catCount}>{c.count}세트</Text>
              </View>
            ))
          ) : (
            <Text style={styles.empty}>아직 부위별 데이터가 없어요.</Text>
          )}
        </Card>

        {loaded && stats && stats.totalDays === 0 ? (
          <EmptyState icon="chart-box-outline" title="아직 통계가 없어요" description="운동을 기록하면 여기에 모여요!" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({
  label,
  value,
  unit,
  tint,
}: {
  label: string;
  value: number;
  unit: string;
  tint: 'surface' | 'neutral' | 'partner' | 'together';
}) {
  return (
    <Card elevation="sm" tint={tint} style={styles.summaryCard}>
      <Text style={styles.summaryValue}>
        {value}
        <Text style={styles.summaryUnit}>{unit}</Text>
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md },
  summaryRow: { flexDirection: 'row', gap: spacing.sm },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: spacing.lg },
  summaryValue: { fontSize: fontSize.heading, fontWeight: '800', color: colors.textPrimary },
  summaryUnit: { fontSize: fontSize.body, fontWeight: '700' },
  summaryLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs, fontWeight: '600' },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: spacing.xs },
  dayDot: { width: 34, height: 34, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  dayDotDone: { backgroundColor: colors.primary },
  check: { color: colors.white, fontWeight: '800' },
  dayLabel: { fontSize: fontSize.caption, color: colors.textSecondary },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catName: { width: 48, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  barTrack: { flex: 1, height: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.pill },
  catCount: { width: 56, textAlign: 'right', fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  empty: { color: colors.textSecondary, fontSize: fontSize.body },
});
