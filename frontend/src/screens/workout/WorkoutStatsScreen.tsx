/**
 * 운동 통계 — 설계서 WORKOUT-07 (주간/월간 · 최근 7일 · 부위별).
 *
 * <p>아래 절반은 <b>심화 통계(PRO — `WORKOUT_V2_STATS`)</b>다: 8주 볼륨 추이 · 추정 1RM
 * 상위 종목 · 부위 밸런스. `DietStatsScreen` 이 `FULL_STATS` 로 쓰는 모양 그대로다.
 *
 * <p><b>위 절반에서 아무것도 빼지 않았다.</b> 무료로 보이던 주·월 운동일수, 최근 7일 그래프,
 * 30일 부위별 세트 수는 그대로다. 잠기는 건 새로 얹은 세 가지뿐이다 — 쓰던 것을 뺏으면
 * 새 상품이 아니라 기능 회수로 체감된다(docs/STICKER_PACK_OVERLAP_2026-09-14.md).
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { LockedCard } from '../../components/LockedCard';
import { workoutApi } from '../../api/workout';
import type { WorkoutDeepStats, WorkoutStats } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

const CAT_COLORS: Record<string, string> = {
  근력: colors.primary,
  유산소: colors.secondary,
  유연성: colors.accent,
};

export function WorkoutStatsScreen() {
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 실패해도 stats 를 null 로 지우지 않는다 — 그러면 "0일" 카드들이 실제 0인 것처럼
  // 보인다(QA_CHECKLIST.md P1-7). error 로 별도 표시해 재시도할 수 있게 한다.
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return workoutApi
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

  const maxCat = Math.max(1, ...(stats?.categoryBreakdown.map((c) => c.count) ?? [1]));

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

        {/*
          심화 통계 — 서버가 잠김을 값으로 내려준다(deep === null). 화면이 자동으로 부르는
          조회라 402 를 띄우면 통계 화면이 통째로 못 뜬다(LockedCard 주석과 같은 이유).
          기록이 하나도 없는 사람에게는 잠금 카드도 안 띄운다 — 팔기 전에 쓸 것이 있어야 한다.
        */}
        {loaded && stats && stats.totalDays > 0 ? (
          stats.deep ? (
            <DeepStatsSection deep={stats.deep} />
          ) : (
            <LockedCard
              title="심화 통계"
              description="주간 볼륨 추이, 종목별 추정 1RM, 부위 밸런스를 볼 수 있어요."
            />
          )
        ) : null}

        {loaded && stats && stats.totalDays === 0 ? (
          <EmptyState icon="chart-box-outline" title="아직 통계가 없어요" description="운동을 기록하면 여기에 모여요!" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * 볼륨 · 1RM · 밸런스 세 카드.
 *
 * <p>막대 하나하나에 숫자를 붙이지 않는다 — 여기서 읽어야 할 것은 절대값이 아니라
 * <b>모양</b>(늘고 있나, 한쪽으로 쏠렸나)이다. 정확한 값이 필요하면 종목별 기록 화면이 있다.
 */
function DeepStatsSection({ deep }: { deep: WorkoutDeepStats }) {
  // 0 으로 나누지 않게 하한을 둔다 — 기록이 없는 주가 섞이면 최댓값이 0 일 수 있다
  const maxVolume = Math.max(1, ...deep.weeklyVolume.map((w) => w.volumeKg));
  const maxShare = Math.max(1, ...deep.muscleBalance.map((m) => m.sharePercent));

  return (
    <>
      <Card elevation="sm" style={styles.section}>
        <Text style={styles.sectionTitle}>주간 볼륨 (최근 8주)</Text>
        {deep.weeklyVolume.some((w) => w.volumeKg > 0) ? (
          <View style={styles.volumeRow}>
            {deep.weeklyVolume.map((w) => (
              <View key={w.weekStart} style={styles.volumeCol}>
                <View style={styles.volumeTrack}>
                  {/* 최소 높이 2% — 0 인 주도 막대 자리가 보여야 "빠진 주"가 읽힌다 */}
                  <View style={[styles.volumeFill, { height: `${Math.max(2, (w.volumeKg / maxVolume) * 100)}%` }]} />
                </View>
                <Text style={styles.volumeLabel}>{w.weekStart.slice(5).replace('-', '/')}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>무게를 기록한 세트가 아직 없어요.</Text>
        )}
      </Card>

      <Card elevation="sm" style={styles.section}>
        <Text style={styles.sectionTitle}>추정 1RM</Text>
        {deep.topLifts.length > 0 ? (
          deep.topLifts.map((l) => (
            <View key={l.exerciseName} style={styles.catRow}>
              <Text style={styles.liftName} numberOfLines={1}>{l.exerciseName}</Text>
              <Text style={styles.liftValue}>{l.bestE1rmKg}kg</Text>
              <Text style={styles.liftSub}>최고 {l.bestWeightKg}kg</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>무게와 횟수를 기록하면 여기에 쌓여요.</Text>
        )}
      </Card>

      <Card elevation="sm" style={styles.section}>
        <Text style={styles.sectionTitle}>부위 밸런스 (최근 30일)</Text>
        {deep.muscleBalance.length > 0 ? (
          deep.muscleBalance.map((m) => (
            <View key={m.muscleGroup} style={styles.catRow}>
              <Text style={styles.catName} numberOfLines={1}>{m.muscleGroup}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(m.sharePercent / maxShare) * 100}%`, backgroundColor: colors.secondary }]} />
              </View>
              <Text style={styles.catCount}>{m.sharePercent}%</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>아직 부위 데이터가 없어요.</Text>
        )}
      </Card>
    </>
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
  volumeRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 96 },
  volumeCol: { flex: 1, alignItems: 'center', gap: spacing.xs },
  volumeTrack: { width: '60%', height: 72, justifyContent: 'flex-end' },
  volumeFill: { width: '100%', borderRadius: radius.sm, backgroundColor: colors.primary },
  volumeLabel: { fontSize: 10, color: colors.textSecondary },
  liftName: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  liftValue: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '800' },
  liftSub: { width: 76, textAlign: 'right', fontSize: fontSize.caption, color: colors.textSecondary },
}));
