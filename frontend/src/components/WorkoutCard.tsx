import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Workout } from '../types';
import { relativeDateLabel } from '../utils/date';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface Props {
  workout: Workout;
  onLongPress?: (workout: Workout) => void;
}

/** 운동 기록 카드 — 날짜·시간·세트 요약 */
export function WorkoutCard({ workout, onLongPress }: Props) {
  const setCount = workout.sets?.length ?? 0;
  return (
    <TouchableOpacity
      activeOpacity={onLongPress ? 0.7 : 1}
      onLongPress={onLongPress ? () => onLongPress(workout) : undefined}
      style={styles.card}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{relativeDateLabel(workout.workoutDate)}</Text>
        {workout.totalDurationMin ? (
          <Text style={styles.duration}>{workout.totalDurationMin}분</Text>
        ) : null}
      </View>

      {workout.sets?.slice(0, 4).map((s, i) => (
        <Text key={s.id ?? i} style={styles.setLine}>
          • {s.exerciseName}
          {s.sets ? ` ${s.sets}세트` : ''}
          {s.reps ? ` x ${s.reps}회` : ''}
          {s.weightKg ? ` · ${s.weightKg}kg` : ''}
        </Text>
      ))}
      {setCount > 4 ? <Text style={styles.more}>외 {setCount - 4}개</Text> : null}

      {workout.memo ? <Text style={styles.memo}>"{workout.memo}"</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  date: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  duration: { fontSize: fontSize.caption, color: colors.secondary, fontWeight: '600' },
  setLine: { fontSize: fontSize.body, color: colors.textPrimary, marginTop: 2 },
  more: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  memo: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm, fontStyle: 'italic' },
});
