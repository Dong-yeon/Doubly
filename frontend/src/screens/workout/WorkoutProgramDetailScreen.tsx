/**
 * 맞춤 프로그램 상세 — Day 선택 화면. "내 루틴"에서 프로그램 카드를 탭하면 여기로 들어와
 * Day1/Day2/... 중 오늘 할 걸 골라 세션을 시작한다. 예전엔 이 Day 들이 전부 "내 루틴"에
 * 평면 나열돼 있었는데, 이제는 프로그램 카드 하나 뒤에 여기서만 보인다.
 */
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { EmptyState } from '../../components/EmptyState';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { routineToSessionParams } from '../../utils/routine';
import { WEEK_DAYS, todayWeekDay } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { WorkoutProgram } from '../../types';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutProgramDetail'>;

export function WorkoutProgramDetailScreen({ navigation, route }: Props) {
  const { programId } = route.params;
  const [program, setProgram] = useState<WorkoutProgram | null>(null);
  const [loaded, setLoaded] = useState(false);
  // 로드 실패(네트워크)와 "진짜 삭제됨"을 구분한다 — WorkoutDetailScreen 과 동일 패턴.
  // 실패를 "찾을 수 없어요"로 뭉뚱그리면 삭제되지 않은 프로그램인데도 사라졌다고 오인시킨다
  // (QA_CHECKLIST.md 전역 반복 패턴 1)
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setProgram(await workoutApi.programDetail(programId));
    } catch (e) {
      toast.error(getErrorMessage(e, '프로그램을 불러오지 못했어요.'));
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [programId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    if (program) navigation.setOptions({ title: program.title });
  }, [program, navigation]);

  const today = todayWeekDay();

  const startDay = (day: WorkoutProgram['days'][number]) => {
    haptics.light();
    navigation.navigate('WorkoutSession', routineToSessionParams(day.routine));
  };

  const onDelete = () => {
    if (!program) return;
    Alert.alert('프로그램 삭제', `"${program.title}"과(와) Day ${program.days.length}개를 모두 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutApi.removeProgram(program.id);
            haptics.light();
            navigation.goBack();
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  if (loaded && !program) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        {loadError ? (
          <EmptyState
            icon="cloud-off-outline"
            title="불러오지 못했어요"
            description="네트워크 상태를 확인하고 다시 시도해주세요."
            error
            onRetry={load}
          />
        ) : (
          <EmptyState
            icon="calendar-month-outline"
            title="프로그램을 찾을 수 없어요"
            description="삭제됐거나 접근할 수 없는 프로그램이에요."
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        {program ? (
          <>
            <Text style={styles.weeksLabel}>{program.totalWeeks}주 프로그램 · Day {program.days.length}개</Text>
            {[...program.days]
              .sort((a, b) => a.dayNo - b.dayNo)
              .map((day) => {
                const isToday = day.routine.scheduledDays.includes(today);
                // "프로그램명 - Day1" 관례에서 프로그램명을 잘라내고 남은 부분만 부제로 보여준다
                const shortTitle = day.routine.title.split(' - ').pop() ?? day.routine.title;
                return (
                  <TouchableOpacity
                    key={day.dayNo}
                    style={[styles.card, isToday && styles.cardToday]}
                    activeOpacity={0.8}
                    onPress={() => startDay(day)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={styles.titleRow}>
                        <Text style={styles.dayBadgeText}>Day {day.dayNo}</Text>
                        <Text style={styles.title}>{shortTitle}</Text>
                        {isToday ? (
                          <View style={styles.todayBadge}>
                            <Text style={styles.todayBadgeText}>오늘</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.start}>시작</Text>
                    </View>
                    {day.routine.scheduledDays.length > 0 ? (
                      <View style={styles.dayDotRow}>
                        {WEEK_DAYS.map((d) => {
                          const active = day.routine.scheduledDays.includes(d.value);
                          return (
                            <View key={d.value} style={[styles.dayDot, active && styles.dayDotActive]}>
                              <Text style={[styles.dayDotText, active && styles.dayDotTextActive]}>{d.label}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    <Text style={styles.summary} numberOfLines={2}>
                      {day.routine.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
                    </Text>
                    <Text style={styles.count}>{day.routine.exercises.length}개 운동</Text>
                  </TouchableOpacity>
                );
              })}
            <TouchableOpacity style={styles.deleteLink} onPress={onDelete}>
              <Text style={styles.deleteLinkText}>프로그램 삭제</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  weeksLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardToday: { borderColor: colors.primary, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1, flexWrap: 'wrap' },
  dayBadgeText: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.primary,
    backgroundColor: colors.primaryBg,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  todayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  todayBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  start: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  dayDotRow: { flexDirection: 'row', gap: 4, marginTop: spacing.xs },
  dayDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayDotActive: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  dayDotText: { fontSize: 10, fontWeight: '700', color: colors.textTertiary },
  dayDotTextActive: { color: colors.primary },
  summary: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs, lineHeight: 18 },
  count: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.xs },
  deleteLink: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  deleteLinkText: { fontSize: fontSize.caption, color: colors.danger, fontWeight: '700' },
}));
