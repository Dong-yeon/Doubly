/** 식단 메인 — 오늘 기록 + 히스토리 + 스트릭/커플 목표 + 캘린더/통계 진입 */
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { MealCard } from '../../components/MealCard';
import { WorkoutDietSegment } from '../../components/WorkoutDietSegment';
import { EmptyState } from '../../components/EmptyState';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { dietApi } from '../../api/diet';
import { streakApi } from '../../api/streak';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { CoupleMealGoal, Meal, Streak } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'DietMain'>;

export function DietScreen({ navigation }: Props) {
  const { today, history, loading, loadingMore, fetchToday, fetchHistory, loadMoreHistory, remove } =
    useDietStore();
  const setDietGoal = useRelationStore((s) => s.setDietGoal);
  const [myStreak, setMyStreak] = useState<Streak | null>(null);
  const [coupleStreak, setCoupleStreak] = useState<Streak | null>(null);
  const [goal, setGoal] = useState<CoupleMealGoal | null>(null);
  const [goalModal, setGoalModal] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

  const refreshExtras = useCallback(() => {
    streakApi.mealMe().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.mealCouple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    dietApi.coupleGoal().then(setGoal).catch(() => setGoal(null));
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchToday();
      fetchHistory();
      refreshExtras();
    }, [fetchToday, fetchHistory, refreshExtras]),
  );

  const onPickGoal = async (days: number) => {
    setSavingGoal(true);
    try {
      await setDietGoal(days);
      haptics.success();
      toast.success(`커플 식단 목표: 주 ${days}일 🎯`);
      setGoalModal(false);
      refreshExtras();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingGoal(false);
    }
  };

  const onLongPress = (m: Meal) => {
    Alert.alert('식단 기록 삭제', `${m.mealTypeLabel} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove(m.id);
          } catch (e) {
            Alert.alert('오류', getErrorMessage(e));
          }
        },
      },
    ]);
  };

  const todayCalories = today.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <WorkoutDietSegment active="diet" />
      <View style={styles.linksRow}>
        <TouchableOpacity onPress={() => navigation.navigate('DietStats')}>
          <Text style={styles.link}>📊 통계</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('DietCalendar')}>
          <Text style={styles.link}>📅 캘린더</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={history}
        keyExtractor={(m) => String(m.id)}
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
            {/* 식단 스트릭 */}
            <View style={styles.streakRow}>
              <Text style={styles.streakText}>🥗 연속 {myStreak?.currentCount ?? 0}일</Text>
              {goal?.connected ? (
                <Text style={styles.streakText}>👩‍❤️‍👨 함께 {coupleStreak?.currentCount ?? 0}일</Text>
              ) : null}
              <Text style={styles.streakMax}>최고 {myStreak?.maxCount ?? 0}일</Text>
            </View>

            {/* 커플 공동 목표 */}
            {goal?.connected ? (
              <Pressable style={styles.goalCard} onPress={() => setGoalModal(true)}>
                {goal.goalDays ? (
                  <>
                    <View style={styles.goalHeader}>
                      <Text style={styles.goalTitle}>
                        🎯 이번 주 함께 식단 {goal.bothDays}/{goal.goalDays}일
                      </Text>
                      {goal.achieved ? <Text style={styles.goalBadge}>달성! 🎉</Text> : null}
                    </View>
                    <View style={styles.goalTrack}>
                      <View
                        style={[
                          styles.goalFill,
                          { width: `${Math.min(100, (goal.bothDays / goal.goalDays) * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.goalSub}>
                      나 {goal.myDays}일 · 상대 {goal.partnerDays}일 — 둘 다 기록한 날만 카운트돼요
                    </Text>
                  </>
                ) : (
                  <View style={styles.goalHeader}>
                    <Text style={styles.goalTitle}>🎯 커플 식단 목표를 정해볼까요?</Text>
                    <Text style={styles.goalSet}>설정하기 ›</Text>
                  </View>
                )}
              </Pressable>
            ) : null}

            <View style={styles.todayHeader}>
              <Text style={styles.sectionTitle}>오늘</Text>
              {todayCalories > 0 ? (
                <Text style={styles.todayCal}>총 {todayCalories} kcal</Text>
              ) : null}
            </View>
            {today.length > 0 ? (
              today.map((m) => <MealCard key={m.id} meal={m} onLongPress={onLongPress} />)
            ) : (
              <View style={styles.emptyToday}>
                <Text style={styles.emptyText}>오늘 식단 기록이 아직 없어요 🍽️</Text>
              </View>
            )}
            <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} onLongPress={onLongPress} showDate />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState emoji="🍽️" title="아직 식단 기록이 없어요" description="아래 버튼으로 첫 식단을 기록해보세요!" />
          ) : null
        }
        ListFooterComponent={loadingMore ? <Text style={styles.footer}>불러오는 중…</Text> : null}
      />

      <View style={styles.fabWrap}>
        <Button title="＋ 식단 기록하기" onPress={() => navigation.navigate('DietRecord')} />
      </View>

      {/* 커플 목표 설정 모달 */}
      <Modal visible={goalModal} transparent animationType="fade" onRequestClose={() => setGoalModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>커플 식단 목표 🎯</Text>
            <Text style={styles.modalDesc}>이번 주에 둘 다 식단을 기록할 목표 일수를 정해요.</Text>
            <View style={styles.dayRow}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, goal?.goalDays === d && styles.dayChipActive]}
                  disabled={savingGoal}
                  onPress={() => onPickGoal(d)}
                >
                  <Text style={[styles.dayText, goal?.goalDays === d && styles.dayTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalHint}>주 {goal?.goalDays ?? '-'}일 · 탭하면 바로 저장돼요</Text>
          </Pressable>
        </Pressable>
      </Modal>
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
  link: { fontSize: fontSize.body, color: colors.primary, fontWeight: '600' },
  linksRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  list: { padding: spacing.lg, paddingBottom: 120 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  streakText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  streakMax: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: 'auto' },
  goalCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  goalBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.success },
  goalSet: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  goalTrack: { height: 10, borderRadius: radius.pill, backgroundColor: colors.white, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  goalSub: { fontSize: fontSize.caption, color: colors.textSecondary },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  todayCal: { fontSize: fontSize.body, color: colors.accent, fontWeight: '800' },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  historyTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, gap: spacing.md },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  modalDesc: { fontSize: fontSize.body, color: colors.textSecondary },
  dayRow: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  dayChip: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  dayText: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  dayTextActive: { color: colors.white },
  modalHint: { fontSize: fontSize.caption, color: colors.textTertiary, textAlign: 'center' },
});
