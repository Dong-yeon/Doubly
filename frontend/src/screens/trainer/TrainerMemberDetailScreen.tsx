/** 회원 상세 — 루틴 배정·현황 + 최근 운동 기록 (TRAINER-03/04) */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { trainerApi } from '../../api/trainer';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { TrainerRoutine, Workout } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'TrainerMemberDetail'>;

export function TrainerMemberDetailScreen({ navigation, route }: Props) {
  const { memberId, name } = route.params;
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [routines, setRoutines] = useState<TrainerRoutine[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, r] = await Promise.all([
        trainerApi.memberWorkouts(memberId),
        trainerApi.memberRoutines(memberId),
      ]);
      setWorkouts(w);
      setRoutines(r);
    } catch (e) {
      toast.error(getErrorMessage(e, '회원 정보를 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onDeleteRoutine = (routine: TrainerRoutine) => {
    Alert.alert('루틴 삭제', `"${routine.title}" 루틴을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await trainerApi.deleteRoutine(routine.id);
            haptics.light();
            toast.success('루틴을 삭제했어요.');
            load();
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={workouts}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            {/* 루틴 섹션 */}
            <Text style={styles.sectionTitle}>배정한 루틴</Text>
            {routines.length > 0 ? (
              routines.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={styles.routineRow}
                  activeOpacity={0.7}
                  onLongPress={() => onDeleteRoutine(r)}
                >
                  <View style={styles.routineInfo}>
                    <Text style={styles.routineTitle}>{r.title}</Text>
                    <Text style={styles.routineSub}>
                      {r.routineDate ?? '날짜 미지정'}
                      {r.description ? ` · ${r.description.split('\n')[0]}` : ''}
                    </Text>
                  </View>
                  <Text style={styles.routineBadge}>{r.isCompleted ? '완료' : '대기'}</Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={styles.emptyRoutine}>아직 배정한 루틴이 없어요. (길게 눌러 삭제)</Text>
            )}
            <Button
              title="루틴 배정하기"
              variant="secondary"
              size="md"
              onPress={() => navigation.navigate('TrainerRoutineAssign', { memberId, name })}
              style={styles.assignBtn}
            />

            <Text style={[styles.sectionTitle, styles.workoutTitle]}>최근 운동 기록</Text>
          </View>
        }
        renderItem={({ item }) => <WorkoutCard workout={item} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="dumbbell" title="아직 운동 기록이 없어요" description="회원이 운동을 기록하면 여기에 표시돼요." />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  workoutTitle: { marginTop: spacing.lg },
  routineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  routineInfo: { flex: 1 },
  routineTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  routineSub: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  routineBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  emptyRoutine: { fontSize: fontSize.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  assignBtn: { marginTop: spacing.xs },
});
