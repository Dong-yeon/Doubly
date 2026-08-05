/** 운동 메인 — 설계서 2.4 (오늘 기록 + 트레이너 루틴 + 히스토리 + 캘린더 진입). WORKOUT-02/03 */
import React, { useCallback, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { WorkoutCard } from '../../components/WorkoutCard';
import { EmptyState } from '../../components/EmptyState';
import { useWorkoutStore } from '../../store/workoutStore';
import { WorkoutDietSegment } from '../../components/WorkoutDietSegment';
import { trainerApi } from '../../api/trainer';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { TrainerRoutine, Workout } from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { layout } from '../../theme/layout';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutMain'>;

export function WorkoutScreen({ navigation }: Props) {
  const { today, history, loading, loadingMore, fetchToday, fetchHistory, loadMoreHistory, remove } =
    useWorkoutStore();
  /* [트레이너 기능 일시 비활성화] 되돌리려면 이 블록과 아래 "트레이너 루틴" 섹션 주석을 해제하고
     useFocusEffect 에 fetchRoutines() 를 다시 넣는다.
  // 트레이너가 배정한 미완료 루틴 (트레이너 미연결이면 빈 배열)
  const [routines, setRoutines] = useState<TrainerRoutine[]>([]);
  const [completingId, setCompletingId] = useState<number | null>(null);

  const fetchRoutines = useCallback(async () => {
    try {
      const all = await trainerApi.myRoutines();
      setRoutines(all.filter((r) => !r.isCompleted).slice(0, 5));
    } catch {
      setRoutines([]); // 루틴은 부가 정보 — 실패해도 화면은 정상 동작
    }
  }, []);

  const onCompleteRoutine = async (routine: TrainerRoutine) => {
    setCompletingId(routine.id);
    try {
      await trainerApi.completeRoutine(routine.id);
      haptics.success();
      toast.success(`"${routine.title}" 완료! 트레이너에게 알렸어요 `);
      fetchRoutines();
    } catch (e) {
      toast.error(getErrorMessage(e, '루틴 완료 처리에 실패했어요.'));
    } finally {
      setCompletingId(null);
    }
  };
  */

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
      <WorkoutDietSegment active="workout" />
      {/* 링크 6개 — 좁은 화면(320px)에선 한 줄에 안 들어가 가로 스크롤로 둔다.
          wrap 으로 두면 "캘린더" 만 둘째 줄에 홀로 떨어져 깨져 보인다. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.linksScroll}
        contentContainerStyle={styles.linksRow}
      >
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('WorkoutRoutines')}>
          <Text style={styles.calendarLink}>내 루틴</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('BodyMetric')}>
          <Text style={styles.calendarLink}>몸 변화</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('Challenge')}>
          <Text style={styles.calendarLink}>대결</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('WorkoutRecommend')}>
          <Text style={styles.calendarLink}>AI 추천</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('WorkoutStats')}>
          <Text style={styles.calendarLink}>통계</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkHit} onPress={() => navigation.navigate('WorkoutCalendar')}>
          <Text style={styles.calendarLink}>캘린더</Text>
        </TouchableOpacity>
      </ScrollView>

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
            {/* [트레이너 기능 일시 비활성화] 트레이너가 배정한 루틴
            {routines.length > 0 ? (
              <View style={styles.routineSection}>
                <Text style={styles.sectionTitle}>트레이너 루틴</Text>
                {routines.map((r) => (
                  <View key={r.id} style={styles.routineCard}>
                    <View style={styles.routineInfo}>
                      <Text style={styles.routineTitle}>{r.title}</Text>
                      <Text style={styles.routineSub}>
                        {r.trainerName ? `${r.trainerName} 트레이너` : '트레이너'}
                        {r.routineDate ? ` · ${r.routineDate}` : ''}
                      </Text>
                      {r.description ? <Text style={styles.routineDesc}>{r.description}</Text> : null}
                    </View>
                    <Button
                      title="완료"
                      size="md"
                      variant="soft"
                      onPress={() => onCompleteRoutine(r)}
                      loading={completingId === r.id}
                      style={styles.routineDone}
                    />
                  </View>
                ))}
              </View>
            ) : null}
            */}

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

const styles = themedStyles((colors) => ({
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
  // 가로 스크롤 — 세로 공간을 차지하지 않도록 flexGrow 0
  linksScroll: { flexGrow: 0 },
  linksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  /**
   * 링크 하나의 터치 영역. 예전엔 TouchableOpacity 가 <b>맨 텍스트만</b> 감싸
   * 높이 20px 이었다 — 화면 전환 입구 6개가 전부 그 크기였다.
   * 글자 크기는 그대로 두고 터치 영역만 키운다.
   */
  linkHit: {
    minHeight: layout.touchTarget,
    // 2글자 라벨('대결'·'통계')은 폭이 42px 에 그쳐 가로도 함께 보장한다
    minWidth: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  calendarLink: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
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
  routineSection: { marginBottom: spacing.md },
  routineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  routineInfo: { flex: 1 },
  routineTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  routineSub: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  routineDesc: { fontSize: fontSize.caption, color: colors.textPrimary, marginTop: spacing.xs },
  routineDone: { paddingHorizontal: spacing.md },
  footer: { textAlign: 'center', color: colors.textSecondary, paddingVertical: spacing.md },
  fabWrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg },
  fabRow: { flexDirection: 'row', gap: spacing.sm },
  fabBtn: { flex: 1 },
}));
