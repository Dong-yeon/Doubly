/** 내 운동 루틴 목록 — 탭하면 세션으로 실행, 길게 눌러 삭제 */
import React, { useCallback, useState } from 'react';
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
        data={routines}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() => startSession(item)}
            onLongPress={() => onDelete(item)}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.start}>시작</Text>
            </View>
            <Text style={styles.summary} numberOfLines={2}>
              {item.exercises.map((e) => e.exerciseName).join(' · ') || '운동 없음'}
            </Text>
            <Text style={styles.count}>{item.exercises.length}개 운동 · 길게 눌러 삭제</Text>
          </TouchableOpacity>
        )}
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  start: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '800' },
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
