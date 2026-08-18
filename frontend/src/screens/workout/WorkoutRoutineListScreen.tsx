/**
 * 내 운동 루틴 목록 — 탭하면 세션으로 실행, 길게 눌러 삭제.
 * 요일이 배정된 루틴(짐워크 스타일 "Day1은 월/목")은 카드에 요일 점을 보여주고,
 * 오늘 요일과 겹치면 "오늘" 배지를 달아 목록 맨 위로 올린다 — 오늘 뭘 할지 고민 없이
 * 첫 카드를 탭하면 그게 오늘 루틴이 되게 한다.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { WEEK_DAYS, todayWeekDay } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { WorkoutRoutine } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutines'>;

export function WorkoutRoutineListScreen({ navigation }: Props) {
  const [routines, setRoutines] = useState<WorkoutRoutine[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRoutines(await workoutApi.routines());
    } catch (e) {
      toast.error(getErrorMessage(e, '루틴을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const today = todayWeekDay();
  // 오늘 요일이 배정된 루틴을 앞으로 — Array.sort 는 안정 정렬이라 같은 그룹 안에서는
  // 원래 순서(최근 만든 순, WorkoutRoutineService.list)가 유지된다
  const sortedRoutines = useMemo(
    () =>
      [...routines].sort(
        (a, b) => Number(b.scheduledDays.includes(today)) - Number(a.scheduledDays.includes(today)),
      ),
    [routines, today],
  );

  const startSession = (routine: WorkoutRoutine) => {
    haptics.light();
    navigation.navigate('WorkoutSession', {
      routineId: routine.id,
      routineTitle: routine.title,
      exercises: routine.exercises.map((e) => ({
        name: e.exerciseName,
        category: e.category ?? undefined,
        targetSets: e.targetSets ?? undefined,
        reps: e.reps ?? undefined,
        weightKg: e.weightKg ?? undefined,
        muscleGroup: e.muscleGroup ?? undefined,
        equipment: e.equipment ?? undefined,
        exerciseCatalogId: e.exerciseCatalogId ?? undefined,
        restSeconds: e.restSeconds ?? undefined,
        // 세트별 목표가 있으면 세션이 종목마다 다른 무게·횟수로 시작한다(램프업/백오프 등)
        sets: e.sets?.map((s) => ({
          reps: s.reps ?? undefined,
          weightKg: s.weightKg ?? undefined,
          setType: s.setType ?? undefined,
        })),
        alternatives: e.alternatives?.map((a) => ({
          exerciseCatalogId: a.exerciseCatalogId,
          name: a.name,
          muscleGroup: a.muscleGroup,
          equipment: a.equipment ?? undefined,
        })),
      })),
    });
  };

  const onDelete = (routine: WorkoutRoutine) => {
    Alert.alert('루틴 삭제', `"${routine.title}"을(를) 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await workoutApi.removeRoutine(routine.id);
            haptics.light();
            setRoutines((prev) => prev.filter((r) => r.id !== routine.id));
          } catch (e) {
            toast.error(getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={sortedRoutines}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          const isToday = item.scheduledDays.includes(today);
          return (
            <TouchableOpacity
              style={[styles.card, isToday && styles.cardToday]}
              activeOpacity={0.8}
              onPress={() => startSession(item)}
              onLongPress={() => onDelete(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  {isToday ? (
                    <View style={styles.todayBadge}>
                      <Text style={styles.todayBadgeText}>오늘</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.start}>시작</Text>
              </View>
              {/* 요일 배정 — 짐워크 스타일 미니 캘린더 점. 비어 있으면(자유 루틴) 아예 숨긴다 */}
              {item.scheduledDays.length > 0 ? (
                <View style={styles.dayDotRow}>
                  {WEEK_DAYS.map((d) => {
                    const active = item.scheduledDays.includes(d.value);
                    return (
                      <View key={d.value} style={[styles.dayDot, active && styles.dayDotActive]}>
                        <Text style={[styles.dayDotText, active && styles.dayDotTextActive]}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <Text style={styles.summary} numberOfLines={2}>
                {item.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
              </Text>
              <Text style={styles.count}>{item.exercises.length}개 운동 · 길게 눌러 삭제</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              icon="clipboard-text-outline"
              title="아직 루틴이 없어요"
              description="자주 하는 운동을 루틴으로 만들면 원탭으로 세션을 시작할 수 있어요."
            />
          ) : null
        }
        ListFooterComponent={
          <TouchableOpacity
            style={styles.templatesLink}
            onPress={() => navigation.navigate('WorkoutRoutineTemplates')}
          >
            <Text style={styles.templatesLinkText}>✨ 검증된 루틴 둘러보기</Text>
          </TouchableOpacity>
        }
      />
      <View style={styles.fabWrap}>
        <Button title="＋ 루틴 만들기" onPress={() => navigation.navigate('WorkoutRoutineForm')} />
      </View>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  // 오늘 요일이 배정된 루틴 — 테두리로만 강조한다(배경을 바꾸면 다크모드에서 항상 도드라져 소음이 된다)
  cardToday: { borderColor: colors.primary, borderWidth: 1.5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  todayBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  todayBadgeText: { fontSize: 10, fontWeight: '800', color: colors.white },
  start: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
  // 요일 배정 — 짐워크 스타일 미니 캘린더 점 7개(월→일), 배정된 요일만 채운다
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
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  templatesLink: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
    marginBottom: 80,
  },
  templatesLinkText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
}));
