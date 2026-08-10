/** 운동 메인 — 설계서 2.4 (오늘 기록 + 히스토리 + 캘린더 진입). WORKOUT-02/03
 *  트레이너가 배정한 루틴은 이 화면에서 뺐다 — 필요하면 git 히스토리(이 파일의 이전 버전)에서
 *  복원할 수 있다. 트레이너 기능 자체는 src/screens/trainer 에 살아있다. */
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { useWorkoutStore } from '../../store/workoutStore';
import { useRelationStore } from '../../store/relationStore';
import { WorkoutDietSegment } from '../../components/WorkoutDietSegment';
import { QuickLinkChips } from '../../components/QuickLinkChips';
import { streakApi } from '../../api/streak';
import { getErrorMessage } from '../../utils/error';
import { colors, fontSize, spacing } from '../../constants/theme';
import type { Streak, Workout } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutMain'>;

export function WorkoutScreen({ navigation }: Props) {
  const { today, history, loading, loadingMore, fetchToday, fetchHistory, loadMoreHistory, remove } =
    useWorkoutStore();
  // 커플 연결 여부 — "함께 N일"은 연결됐을 때만 의미가 있다 (식단 탭과 동일한 기준)
  const couple = useRelationStore((s) => s.couple);
  const connected = !!couple?.partner;
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [coupleStreak, setCoupleStreak] = useState<Streak | null>(null);

  // 운동 스트릭 — 부가 정보라 실패해도 화면은 정상 동작 (0일로 표시)
  const refreshStreaks = useCallback(() => {
    streakApi.me().then(setMyStreak).catch(() => setMyStreak(null));
    if (connected) {
      streakApi.couple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    }
  }, [connected]);

  useFocusEffect(
    useCallback(() => {
      fetchToday();
      fetchHistory();
      refreshStreaks();
    }, [fetchToday, fetchHistory, refreshStreaks]),
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
      <WorkoutDietSegment active="workout" />
      {/* 아이콘 칩 6개 — 식단 탭과 같은 QuickLinkChips 를 써서 톤을 맞춘다.
          좁은 화면에선 넘치는 만큼 가로 스크롤되고, 오른쪽 페이드가 그 힌트를 준다. */}
      <QuickLinkChips
        links={[
          { icon: 'notebook-outline', label: '내 루틴', onPress: () => navigation.navigate('WorkoutRoutines') },
          { icon: 'human', label: '몸 변화', onPress: () => navigation.navigate('BodyMetric') },
          { icon: 'sword-cross', label: '대결', onPress: () => navigation.navigate('Challenge') },
          { icon: 'creation', label: 'AI 추천', onPress: () => navigation.navigate('WorkoutRecommend') },
          { icon: 'chart-bar', label: '통계', onPress: () => navigation.navigate('WorkoutStats') },
          { icon: 'calendar-blank-outline', label: '캘린더', onPress: () => navigation.navigate('WorkoutCalendar') },
        ]}
      />

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
            {/* 운동 스트릭 — 식단 탭과 같은 표시 형식(연속/함께/최고) */}
            <View style={styles.streakRow}>
              <Text style={styles.streakText}>연속 {myStreak?.currentCount ?? 0}일</Text>
              {connected ? (
                <Text style={styles.streakText}>함께 {coupleStreak?.currentCount ?? 0}일</Text>
              ) : null}
              <Text style={styles.streakMax}>최고 {myStreak?.maxCount ?? 0}일</Text>
            </View>

            {/* 기록이 하나도 없으면 섹션을 숨긴다 — "오늘 없어요" 카드와 EmptyState 가
                겹쳐 빈 안내가 두 번 보이던 중복 제거 (ListEmptyComponent 하나로 통일) */}
            {today.length > 0 || history.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>오늘</Text>
                {today.length > 0 ? (
                  today.map((w) => <WorkoutCard key={w.id} workout={w} onLongPress={onLongPress} />)
                ) : (
                  <View style={styles.emptyToday}>
                    <Text style={styles.emptyText}>오늘 운동 기록이 아직 없어요 </Text>
                  </View>
                )}
                <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <WorkoutCard workout={item} onLongPress={onLongPress} />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="dumbbell" title="아직 운동 기록이 없어요" description="아래 버튼으로 첫 운동을 기록해보세요!" />
          ) : null
        }
        ListFooterComponent={
          loadingMore ? <Text style={styles.footer}>불러오는 중…</Text> : null
        }
      />

      <View style={styles.fabWrap}>
        <View style={styles.fabRow}>
          <Button
            title="세션 시작"
            variant="secondary"
            onPress={() => navigation.navigate('WorkoutSession')}
            style={styles.fabBtn}
          />
          <Button
            title="＋ 기록하기"
            onPress={() => navigation.navigate('WorkoutRecord')}
            style={styles.fabBtn}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: 120 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  streakText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  streakMax: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: 'auto' },
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
  fabRow: { flexDirection: 'row', gap: spacing.sm },
  fabBtn: { flex: 1 },
});
