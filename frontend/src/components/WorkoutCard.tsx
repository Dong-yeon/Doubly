import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Workout } from '../types';
import { relativeDateLabel } from '../utils/date';
import { formatNumber } from '../utils/format';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { MaterialCommunityIcons } from './Icon';

interface Props {
  workout: Workout;
  /** 탭 — 상세 화면으로. 없으면 카드가 눌리지 않는 것처럼 보인다(activeOpacity 1) */
  onPress?: (workout: Workout) => void;
  onLongPress?: (workout: Workout) => void;
}

/** N분 → "1시간 3분" (60분 미만이면 "45분"만) */
function formatDuration(min: number): string {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

/**
 * 총 볼륨(kg) — 완료된 세트만 합산(무게 × 횟수). 세션에서 세트별 실기록(entries)이
 * 있으면 그걸 쓰고, 없으면(직접 기록 화면처럼 종목 단위 평균값만 있는 기록) 세트수×횟수×무게로
 * 근사한다 — 둘 다 "이 종목을 총 몇 kg 들었나"의 근사치라는 점은 같다.
 */
function totalVolumeKg(workout: Workout): number {
  return (workout.sets ?? []).reduce((sum, s) => {
    if (s.entries && s.entries.length > 0) {
      return (
        sum +
        s.entries.reduce((es, e) => es + (e.completed ? (e.weightKg ?? 0) * (e.reps ?? 0) : 0), 0)
      );
    }
    return sum + (s.sets ?? 0) * (s.reps ?? 0) * (s.weightKg ?? 0);
  }, 0);
}

/** 이 기록에 등장한 자극 부위 — 중복 제거, 최대 3개("등, 하체, 어깨" 처럼) */
function muscleGroupSummary(workout: Workout): string {
  const groups = Array.from(
    new Set((workout.sets ?? []).map((s) => s.muscleGroup).filter((g): g is string => !!g)),
  );
  return groups.slice(0, 3).join(', ');
}

/** 운동 기록 카드 — 완료 배지·소요시간·총 볼륨·자극 부위·종목 요약(짐워크 스타일 요약 카드) */
export function WorkoutCard({ workout, onPress, onLongPress }: Props) {
  const setCount = workout.sets?.length ?? 0;
  const volume = totalVolumeKg(workout);
  const muscleGroups = muscleGroupSummary(workout);
  const firstExercise = workout.sets?.[0]?.exerciseName;

  return (
    <TouchableOpacity
      activeOpacity={onPress || onLongPress ? 0.7 : 1}
      onPress={onPress ? () => onPress(workout) : undefined}
      onLongPress={onLongPress ? () => onLongPress(workout) : undefined}
      style={styles.card}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? '눌러서 세트별 기록 보기' : undefined}
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.date}>{relativeDateLabel(workout.workoutDate)}</Text>

          <View style={styles.metaRow}>
            <View style={styles.doneBadge}>
              <Text style={styles.doneBadgeText}>완료</Text>
            </View>
            {workout.totalDurationMin ? (
              <Text style={styles.metaText}>{formatDuration(workout.totalDurationMin)}</Text>
            ) : null}
            {volume > 0 ? (
              <Text style={styles.metaText}>· {formatNumber(Math.round(volume))}kg</Text>
            ) : null}
          </View>

          {muscleGroups ? <Text style={styles.muscleGroups}>{muscleGroups}</Text> : null}

          {setCount > 0 ? (
            <Text style={styles.exerciseSummary}>
              {setCount}개{firstExercise ? ` | ${firstExercise}${setCount > 1 ? ' 외' : ''}` : ''}
            </Text>
          ) : null}

          {workout.memo ? <Text style={styles.memo}>"{workout.memo}"</Text> : null}
        </View>

        <View style={styles.thumb}>
          <MaterialCommunityIcons name="dumbbell" size={22} color={colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = themedStyles((colors) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  date: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  doneBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryBg,
  },
  doneBadgeText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  metaText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  muscleGroups: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm },
  exerciseSummary: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: 2 },
  memo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
