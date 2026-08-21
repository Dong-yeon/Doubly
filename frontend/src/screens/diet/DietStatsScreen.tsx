/**
 * 식단 통계 — 주간/월간 기록일 · 최근 7일 칼로리/단백질. 운동(WorkoutStatsScreen) 미러링.
 *
 * <p>아래 절반은 <b>심화 통계(PRO — `Feature.FULL_STATS`)</b>다: 30일 매크로 달성률 히트맵과
 * 나트륨·당 추이. 잠겨 있으면 서버가 402 대신 `locked` 를 내려주고(자동 조회라 시트를 띄우면
 * 화면 열 때마다 광고가 된다) 그 자리에 LockedCard 를 끼운다.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LockedCard } from '../../components/LockedCard';
import { dietApi } from '../../api/diet';
import type { DayNutrition, MealStats, NutritionTargets } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

export function DietStatsScreen() {
  const [stats, setStats] = useState<MealStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 실패해도 stats 를 null 로 지우지 않는다 — 그러면 "0일" 카드들이 실제 0인 것처럼
  // 보인다(QA_CHECKLIST.md P1-7). error 로 별도 표시해 재시도할 수 있게 한다.
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return dietApi
      .stats()
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const last7 = stats?.last7Days ?? [];
  const maxCal = Math.max(1, ...last7.map((d) => d.calories));
  const maxProtein = Math.max(1, ...last7.map((d) => d.protein));
  const deep = stats?.deep ?? null;
  const loggedDays = last7.filter((d) => d.calories > 0);
  const avgCal = loggedDays.length
    ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
    : 0;

  if (loaded && error && !stats) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="cloud-off-outline"
          title="통계를 불러오지 못했어요"
          description="네트워크 상태를 확인하고 다시 시도해주세요."
          error
          onRetry={load}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* 요약 카드 3개 */}
        <View style={styles.summaryRow}>
          {/* 셋 다 "내 기록" — 소유자 색(상대/함께)을 쓰면 없는 의미가 생긴다 */}
          <SummaryCard label="이번 주" value={stats?.weeklyDays ?? 0} unit="일" tint="neutral" />
          <SummaryCard label="이번 달" value={stats?.monthlyDays ?? 0} unit="일" tint="neutral" />
          <SummaryCard label="누적" value={stats?.totalDays ?? 0} unit="일" tint="neutral" />
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

        {/* 최근 7일 단백질 — 커플 앱에서 가장 자주 보는 매크로라 무료 구간에 둔다 */}
        {last7.some((d) => d.protein > 0) ? (
          <Card elevation="sm" style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>최근 7일 단백질</Text>
              <Text style={styles.avg}>최고 {maxProtein}g</Text>
            </View>
            <View style={styles.chartRow}>
              {last7.map((d) => (
                <View key={d.date} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        {
                          height: `${(d.protein / maxProtein) * 100}%`,
                          backgroundColor: d.protein > 0 ? colors.primary : colors.surfaceAlt,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.barCal}>{d.protein > 0 ? d.protein : ''}</Text>
                  <Text style={styles.dayLabel}>{d.weekday}</Text>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        {/* ── 심화 통계 (PRO) ─────────────────────────────────────────── */}
        {stats?.locked ? (
          <LockedCard
            title="심화 영양 통계"
            description="30일 매크로 달성률·나트륨·당 추이를 볼 수 있어요."
            upgradeMessage="30일 매크로 달성률과 나트륨·당 추이는 PRO에서 볼 수 있어요."
          />
        ) : null}

        {deep ? <MacroHeatmap days={deep.last30Days} targets={deep.targets ?? null} /> : null}
        {deep ? <SodiumSugarTrend days={deep.last30Days} /> : null}

        {loaded && stats && stats.totalDays === 0 ? (
          <EmptyState icon="chart-box-outline" title="아직 통계가 없어요" description="식단을 기록하면 여기에 모여요!" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 30일 매크로 달성률 히트맵 — 목표가 있으면 달성률(%), 없으면 칼로리 절대량으로 칠한다.
 *
 * <p>목표를 안 정한 사람에게 없는 목표를 지어내지 않는다. 대신 "많이 먹은 날/적게 먹은 날"의
 * 농도만 보여준다 — 그것만으로도 리듬이 보인다.
 */
function MacroHeatmap({ days, targets }: { days: DayNutrition[]; targets: NutritionTargets | null }) {
  const targetCal = targets?.calories ?? null;
  const maxCal = Math.max(1, ...days.map((d) => d.calories));
  return (
    <Card elevation="sm" style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>30일 {targetCal ? '목표 달성률' : '기록 농도'}</Text>
        <Text style={styles.avg}>{targetCal ? `목표 ${targetCal}kcal` : '목표 미설정'}</Text>
      </View>
      <View style={styles.heatGrid}>
        {days.map((d) => {
          const ratio = d.calories === 0 ? 0 : Math.min(1, d.calories / (targetCal ?? maxCal));
          return (
            <View
              key={d.date}
              style={[
                styles.heatCell,
                // 기록이 없는 날은 회색 — 0%와 "안 먹은 날"이 같은 색이면 오해를 부른다
                d.calories === 0
                  ? styles.heatEmpty
                  : { backgroundColor: colors.primary, opacity: 0.25 + ratio * 0.75 },
              ]}
              accessibilityLabel={`${d.date} ${d.calories}kcal`}
            />
          );
        })}
      </View>
      <Text style={styles.heatLegend}>왼쪽이 30일 전, 오른쪽이 오늘이에요.</Text>
    </Card>
  );
}

/**
 * 나트륨·당 30일 추이.
 *
 * <p>수치를 "높다/낮다"로 판정하지 않는다 — 권장량 판정은 의료 영역이고, 이 앱이 할 말이
 * 아니다. 흐름만 보여주고 해석은 사용자에게 맡긴다(강박 방지 원칙과 같은 선).
 */
function SodiumSugarTrend({ days }: { days: DayNutrition[] }) {
  const maxSodium = Math.max(1, ...days.map((d) => d.sodium));
  const maxSugar = Math.max(1, ...days.map((d) => d.sugar));
  const logged = days.filter((d) => d.sodium > 0 || d.sugar > 0);
  if (logged.length === 0) return null;
  const avgSodium = Math.round(logged.reduce((sum, d) => sum + d.sodium, 0) / logged.length);
  const avgSugar = Math.round(logged.reduce((sum, d) => sum + d.sugar, 0) / logged.length);
  return (
    <Card elevation="sm" style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>나트륨 · 당 추이</Text>
        <Text style={styles.avg}>평균 {avgSodium}mg · {avgSugar}g</Text>
      </View>
      <View style={styles.trendRow}>
        {days.map((d) => (
          <View key={d.date} style={styles.trendCol}>
            <View style={[styles.trendBar, styles.trendSodium, { height: `${(d.sodium / maxSodium) * 100}%` }]} />
            <View style={[styles.trendBar, styles.trendSugar, { height: `${(d.sugar / maxSugar) * 100}%` }]} />
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, styles.trendSodium]} />
        <Text style={styles.dayLabel}>나트륨</Text>
        <View style={[styles.legendDot, styles.trendSugar]} />
        <Text style={styles.dayLabel}>당</Text>
      </View>
    </Card>
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

const styles = themedStyles((colors) => ({
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
  avg: { fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '800' },
  chartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 140 },
  barCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { width: 18, height: 90, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: radius.pill },
  // 9pt 는 읽기 어렵다 — 막대 위 수치라 작아도 되지만 하한은 지킨다
  barCal: { fontSize: 11, color: colors.textSecondary },
  dayLabel: { fontSize: fontSize.caption, color: colors.textSecondary },

  // 30일 히트맵 — 10칸 × 3줄. space-between 이 남는 폭을 줄 안에 고르게 흩는다
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'space-between' },
  heatCell: { width: '9%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.primary },
  heatEmpty: { backgroundColor: colors.surfaceAlt },
  heatLegend: { fontSize: fontSize.caption, color: colors.textTertiary },

  // 나트륨·당 — 하루당 두 줄기를 나란히 세운다(30일이라 칸이 좁아 선 굵기는 최소)
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 1 },
  trendCol: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: '100%' },
  trendBar: { flex: 1, borderRadius: 1, minHeight: 1 },
  trendSodium: { backgroundColor: colors.indigo },
  trendSugar: { backgroundColor: colors.coral },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
}));
