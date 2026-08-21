/**
 * 운동 기록 상세 — 세트별 실기록(무게·횟수·RPE)을 다시 볼 수 있는 화면.
 *
 * <p><b>왜 필요한가</b>: 세션 화면이 세트마다 실제 무게·횟수·RPE 를 저장하고 있는데
 * 정작 <b>다시 볼 곳이 없었다</b>. 히스토리 카드는 "3개 | 벤치프레스 외" 같은 요약뿐이라,
 * "지난주에 몇 kg 들었더라"를 앱 안에서 확인할 방법이 없었다. 데이터는 이미 응답에
 * 들어 있으므로(WorkoutResponse.sets[].entries) 그리기만 하면 된다.
 *
 * <p>목록에서 객체를 넘기지 않고 id 로 다시 불러온다 — 딥링크(`doubly://workout/records/12`)
 * 나 새로고침으로 직접 열려도 같은 화면이 나와야 한다.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { workoutApi } from '../../api/workout';
import type { Workout, WorkoutSet, WorkoutSetEntry } from '../../types';
import { relativeDateLabel } from '../../utils/date';
import { formatNumber } from '../../utils/format';
import { fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutDetail'>;

/** N분 → "1시간 3분" (60분 미만이면 "45분"만) — WorkoutCard 와 같은 규칙 */
function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

/** 종목 하나의 볼륨 — 완료된 세트만. 실기록이 없으면 종목 단위 값으로 근사한다 */
function exerciseVolume(set: WorkoutSet): number {
  if (set.entries && set.entries.length > 0) {
    return set.entries.reduce(
      (sum, e) => sum + (e.completed ? (e.weightKg ?? 0) * (e.reps ?? 0) : 0),
      0,
    );
  }
  return (set.sets ?? 0) * (set.reps ?? 0) * (set.weightKg ?? 0);
}

function totalVolume(workout: Workout): number {
  return (workout.sets ?? []).reduce((sum, s) => sum + exerciseVolume(s), 0);
}

/** "60kg × 10회" — 값이 없는 자리는 통째로 비운다(0kg 으로 쓰면 실제 맨몸 세트와 구분이 안 된다) */
function entryLabel(entry: WorkoutSetEntry): string {
  const parts: string[] = [];
  if (entry.weightKg != null) parts.push(`${formatNumber(entry.weightKg)}kg`);
  if (entry.reps != null) parts.push(`${entry.reps}회`);
  return parts.length > 0 ? parts.join(' × ') : '기록 없음';
}

export function WorkoutDetailScreen({ route }: Props) {
  const { workoutId } = route.params;
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 실패를 빈 화면으로 위장하지 않는다 — 재시도 버튼이 있는 오류 상태로 구분한다
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return workoutApi
      .one(workoutId)
      .then(setWorkout)
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, [workoutId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!workout) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loaded ? (
          <EmptyState
            title={error ? '기록을 불러오지 못했어요' : '기록을 찾을 수 없어요'}
            description={error ? undefined : '삭제된 기록일 수 있어요.'}
            error={error}
            onRetry={error ? load : undefined}
          />
        ) : null}
      </SafeAreaView>
    );
  }

  const volume = totalVolume(workout);
  const muscleGroups = Array.from(
    new Set((workout.sets ?? []).map((s) => s.muscleGroup).filter((g): g is string => !!g)),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card elevation="sm" style={styles.summary}>
          <Text style={styles.date}>{relativeDateLabel(workout.workoutDate)}</Text>
          <View style={styles.statRow}>
            <Stat label="종목" value={`${workout.sets?.length ?? 0}개`} />
            {workout.totalDurationMin ? (
              <Stat label="운동 시간" value={formatDuration(workout.totalDurationMin)} />
            ) : null}
            {volume > 0 ? (
              <Stat label="총 볼륨" value={`${formatNumber(Math.round(volume))}kg`} />
            ) : null}
          </View>
          {muscleGroups.length > 0 ? (
            <Text style={styles.muscleGroups}>{muscleGroups.join(' · ')}</Text>
          ) : null}
          {workout.memo ? <Text style={styles.memo}>"{workout.memo}"</Text> : null}
        </Card>

        {(workout.sets ?? []).map((set, i) => (
          <Card key={set.id ?? `${set.exerciseName}-${i}`} elevation="sm" style={styles.exercise}>
            <View style={styles.exerciseHeader}>
              <Text style={styles.exerciseName}>{set.exerciseName}</Text>
              {exerciseVolume(set) > 0 ? (
                <Text style={styles.exerciseVolume}>
                  {formatNumber(Math.round(exerciseVolume(set)))}kg
                </Text>
              ) : null}
            </View>
            {set.muscleGroup || set.equipment ? (
              <Text style={styles.exerciseMeta}>
                {[set.muscleGroup, set.equipment].filter(Boolean).join(' · ')}
              </Text>
            ) : null}

            {set.entries && set.entries.length > 0 ? (
              set.entries.map((entry) => (
                <View key={entry.id ?? entry.setNo} style={styles.entryRow}>
                  <Text style={[styles.setNo, !entry.completed && styles.dim]}>{entry.setNo}</Text>
                  <Text style={[styles.entryValue, !entry.completed && styles.dim]}>
                    {entryLabel(entry)}
                  </Text>
                  {entry.rpe != null ? (
                    <Text style={styles.rpe}>RPE {formatNumber(entry.rpe)}</Text>
                  ) : null}
                  {/* 건너뛴 세트도 지우지 않고 흐리게 남긴다 — 그날의 실제 모습이다 */}
                  {!entry.completed ? <Text style={styles.skipped}>건너뜀</Text> : null}
                </View>
              ))
            ) : (
              /* 직접 기록 화면으로 남긴 기록 — 세트별 실기록 없이 종목 단위 값만 있다 */
              <Text style={styles.plainSet}>
                {[
                  set.sets != null ? `${set.sets}세트` : null,
                  set.reps != null ? `${set.reps}회` : null,
                  set.weightKg != null ? `${formatNumber(set.weightKg)}kg` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '세부 기록 없음'}
              </Text>
            )}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },

  summary: { gap: spacing.sm },
  date: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  statRow: { flexDirection: 'row', gap: spacing.lg },
  stat: { gap: 2 },
  statValue: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: fontSize.caption, color: colors.textSecondary },
  muscleGroups: { fontSize: fontSize.caption, color: colors.textSecondary },
  memo: { fontSize: fontSize.caption, color: colors.textSecondary, fontStyle: 'italic' },

  exercise: { gap: spacing.xs },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseName: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  exerciseVolume: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  exerciseMeta: { fontSize: fontSize.caption, color: colors.textTertiary },

  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  setNo: {
    width: 24,
    textAlign: 'center',
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    paddingVertical: 2,
  },
  entryValue: { flex: 1, fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  rpe: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  skipped: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  dim: { color: colors.textMuted },

  plainSet: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600', marginTop: 2 },
}));
