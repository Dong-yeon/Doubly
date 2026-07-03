/** 회원 상세 — 최근 운동 기록 (TRAINER-03) */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MyStackParamList } from '../../navigation/types';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { trainerApi } from '../../api/trainer';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, spacing } from '../../constants/theme';
import type { Workout } from '../../types';

type Props = NativeStackScreenProps<MyStackParamList, 'TrainerMemberDetail'>;

export function TrainerMemberDetailScreen({ route }: Props) {
  const { memberId } = route.params;
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkouts(await trainerApi.memberWorkouts(memberId));
    } catch (e) {
      toast.error(getErrorMessage(e, '회원 기록을 불러오지 못했어요.'));
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={workouts}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => <WorkoutCard workout={item} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState emoji="📝" title="아직 운동 기록이 없어요" description="회원이 운동을 기록하면 여기에 표시돼요." />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xl },
});
