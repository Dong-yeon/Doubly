/** 운동 메인 — 설계서 2.4 (오늘 기록 + 히스토리 + 캘린더 진입). WORKOUT-02/03 */
import React, { useCallback } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { useWorkoutStore } from '../../store/workoutStore';
import { getErrorMessage } from '../../utils/error';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { Workout } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutMain'>;

export function WorkoutScreen({ navigation }: Props) {
  const { today, history, loading, loadingMore, fetchToday, fetchHistory, loadMoreHistory, remove } =
    useWorkoutStore();

  useFocusEffect(
    useCallback(() => {
      fetchToday();
      fetchHistory();
    }, [fetchToday, fetchHistory]),
  );

  const onLongPress = (w: Workout) => {
    Alert.alert('운동 기록 삭제', `${w.workoutDate} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(w.id);
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>운동</Text>
        <View style={styles.headerLinks}>
          <TouchableOpacity onPress={() => navigation.navigate('WorkoutRecommend')}>
            <Text style={styles.calendarLink}>🤖 AI 추천</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('WorkoutStats')}>
            <Text style={styles.calendarLink}>📊 통계</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('WorkoutCalendar')}>
            <Text style={styles.calendarLink}>📅 캘린더</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={history}
        keyExtractor={(w) => String(w.id)}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={() => {
          fetchToday();
          fetchHistory();
        }}
        onEndReachedThreshold={0.3}
        onEndReached={loadMoreHistory}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>오늘</Text>
            {today.length > 0 ? (
              today.map((w) => <WorkoutCard key={w.id} workout={w} onLongPress={onLongPress} />)
            ) : (
              <View style={styles.emptyToday}>
                <Text style={styles.emptyText}>오늘 운동 기록이 아직 없어요 💪</Text>
              </View>
            )}
            <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
          </View>
        }
        renderItem={({ item }) => <WorkoutCard workout={item} onLongPress={onLongPress} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState emoji="📝" title="아직 운동 기록이 없어요" description="아래 버튼으로 첫 운동을 기록해보세요!" />
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <Text style={styles.footer}>불러오는 중…</Text> : null
        }
      />

      <View style={styles.fabWrap}>
        <Button title="＋ 오늘 운동 기록하기" onPress={() => navigation.navigate('WorkoutRecord')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  headerLinks: { flexDirection: 'row', gap: spacing.md },
  calendarLink: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
  list: { padding: spacing.lg, paddingBottom: 120 },
  sectionTitle: {
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  historyTitle: { marginTop: spacing.lg },
  emptyToday: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.body },
  footer: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.md },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
});
