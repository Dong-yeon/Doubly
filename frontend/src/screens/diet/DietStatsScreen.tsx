/** 식단 통계 — 주간/월간 기록일 · 최근 7일 칼로리. 운동(WorkoutStatsScreen) 미러링 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { dietApi } from '../../api/diet';
import type { MealStats } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

export function DietStatsScreen() {
  const [stats, setStats] = useState<MealStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      dietApi
        .stats()
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => setLoaded(true));
    }, []),
  );

  const last7 = stats?.last7Days ?? [];
  const maxCal = Math.max(1, ...last7.map((d) => d.calories));
  const loggedDays = last7.filter((d) => d.calories > 0);
  const avgCal = loggedDays.length
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* 요약 카드 3개 */}
        <View style={styles.summaryRow}>
          <SummaryCard label="이번 주" value={stats?.weeklyDays ?? 0} unit="일" tint="pink" />
          <SummaryCard label="이번 달" value={stats?.monthlyDays ?? 0} unit="일" tint="mint" />
          <SummaryCard label="누적" value={stats?.totalDays ?? 0} unit="일" tint="yellow" />
        </View>

        {/* 최근 7일 칼로리 */}
        <Card elevation="sm" style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>최근 7일 칼로리</Text>
            {avgCal > 0 ? <Text style={styles.avg}>평균 {avgCal} kcal</Text> : null}
          </View>
          <View style={styles.chartRow}>
            {last7.map((d) => (
              <View key={d.date} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { height: `${(d.calories / maxCal) * 100}%`, backgroundColor: d.completed ? colors.accent : colors.surfaceAlt },
                    ]}
                  />
                </View>
                <Text style={styles.barCal}>{d.calories > 0 ? d.calories : ''}</Text>
                <Text style={styles.dayLabel}>{d.weekday}</Text>
              </View>
            ))}
          </View>
        </Card>

        {loaded && stats && stats.totalDays === 0 ? (
          <EmptyState icon="chart-box-outline" title="아직 통계가 없어요" description="식단을 기록하면 여기에 모여요!" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value, unit, tint }: { label: string; value: number; unit: string; tint: 'pink' | 'mint' | 'yellow' }) {
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  avg: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '800' },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { width: 18, height: 90, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: radius.pill },
  barCal: { fontSize: 9, color: colors.textSecondary },
  dayLabel: { fontSize: fontSize.caption, color: colors.textSecondary },
});
