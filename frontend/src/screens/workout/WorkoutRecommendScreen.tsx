/** AI 운동 추천 — 최근 기록 기반 오늘 추천 / 5일 루틴 (결과는 참고용 제안) */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '../../components/Icon';
import { Button } from '../../components/Button';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { runBusy } from '../../store/busyStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { WorkoutRecommendation } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

const PLANS = [
  { days: 1, title: '오늘 뭐하지?' },
  { days: 5, title: '5일 루틴 만들기' },
] as const;

// dayOffset → "오늘" / "내일" / "7/5 (금)"
function dayLabel(offset: number): string {
  if (offset === 0) return '오늘';
  if (offset === 1) return '내일';
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${weekday})`;
}

export function WorkoutRecommendScreen() {
  const [loadingDays, setLoadingDays] = useState<number | null>(null);
  const [result, setResult] = useState<WorkoutRecommendation | null>(null);
  const [savingRoutine, setSavingRoutine] = useState<number | null>(null);

  // AI 추천 하루 계획을 내 루틴으로 저장
  const saveAsRoutine = async (day: WorkoutRecommendation['days'][number]) => {
    setSavingRoutine(day.dayOffset);
    try {
      await workoutApi.saveRoutine({
        title: day.focus || 'AI 추천 루틴',
        exercises: day.exercises.map((ex) => ({
          exerciseName: ex.name,
          category: ex.category ?? undefined,
          targetSets: ex.sets ?? undefined,
          reps: ex.reps ?? undefined,
        })),
      });
      haptics.success();
      toast.success('내 루틴으로 저장했어요 ');
    } catch (e) {
      toast.error(getErrorMessage(e, '루틴 저장에 실패했어요.'));
    } finally {
      setSavingRoutine(null);
    }
  };

  const onRecommend = async (days: number) => {
    setLoadingDays(days);
    try {
      const res = await runBusy('AI가 운동을 추천하고 있어요', () => workoutApi.recommend(days));
      setResult(res);
      haptics.success();
    } catch (e) {
      toast.error(getErrorMessage(e, 'AI 추천에 실패했어요.'));
    } finally {
      setLoadingDays(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>최근 운동 기록을 바탕으로 AI 트레이너가 계획을 제안해요.</Text>

        <View style={styles.planRow}>
          {PLANS.map((p) => (
            <Button
              key={p.days}
              title={p.title}
              variant={p.days === 1 ? 'primary' : 'soft'}
              size="md"
              style={styles.planButton}
              onPress={() => onRecommend(p.days)}
              loading={loadingDays === p.days}
              disabled={loadingDays !== null}
            />
          ))}
        </View>

        {result ? (
          <View>
            {result.overallComment ? (
              <View style={styles.overallCard}>
                <Text style={styles.overallText}>{result.overallComment}</Text>
              </View>
            ) : null}

            {result.days.map((day) => (
              <View key={day.dayOffset} style={styles.dayCard}>
                <Text style={styles.dayTitle}>
                  {dayLabel(day.dayOffset)} · {day.focus}
                </Text>
                {day.exercises.map((ex, i) => (
                  <View key={`${day.dayOffset}-${i}`} style={styles.exerciseRow}>
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName}>{ex.name}</Text>
                      {ex.category ? (
                        <View style={styles.categoryChip}>
                          <Text style={styles.categoryText}>{ex.category}</Text>
                        </View>
                      ) : null}
                      {ex.sets && ex.reps ? (
                        <Text style={styles.setInfo}>
                          {ex.sets}세트 × {ex.reps}회
                        </Text>
                      ) : null}
                    </View>
                    {ex.comment ? <Text style={styles.exerciseComment}>{ex.comment}</Text> : null}
                  </View>
                ))}
                {day.comment ? <Text style={styles.dayComment}>{day.comment}</Text> : null}
                <Button
                  title={savingRoutine === day.dayOffset ? '저장 중…' : '내 루틴으로 저장'}
                  variant="secondary"
                  size="md"
                  onPress={() => saveAsRoutine(day)}
                  loading={savingRoutine === day.dayOffset}
                  disabled={savingRoutine !== null}
                  style={styles.saveRoutineBtn}
                />
              </View>
            ))}

            <Text style={styles.footnote}>
              AI 제안은 참고용이에요. 몸 상태에 맞게 조절하고, 운동 후 기록해 주세요!
            </Text>
          </View>
        ) : loadingDays === null ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="robot-happy-outline" size={40} color={colors.textMuted} style={styles.emptyEmoji} />
            <Text style={styles.emptyText}>위 버튼을 눌러 추천을 받아보세요</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.md },
  planRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  planButton: { flex: 1 },
  overallCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  overallText: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  dayCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  dayTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  exerciseRow: { marginBottom: spacing.sm },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  exerciseName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  categoryChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  setInfo: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  exerciseComment: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  dayComment: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs },
  saveRoutineBtn: { marginTop: spacing.md },
  footnote: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  empty: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.body, color: colors.textSecondary },
}));
