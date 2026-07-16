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
import { TextField } from '../../components/TextField';
import { MealCard } from '../../components/MealCard';
import { WorkoutDietSegment } from '../../components/WorkoutDietSegment';
import { EmptyState } from '../../components/EmptyState';
import { AiInsightButton } from '../../components/AiInsightButton';
import { useDietStore } from '../../store/dietStore';
import { useRelationStore } from '../../store/relationStore';
import { dietApi } from '../../api/diet';
import { summaryApi } from '../../api/summary';
import { streakApi } from '../../api/streak';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { CoupleMealGoal, DietCoach, Meal, NutritionSummary, Streak, WeeklyLetter } from '../../types';

/** 목표 대비 섭취 바 */
function NutritionBar({ label, consumed, target, unit }: { label: string; consumed: number; target?: number | null; unit: string }) {
  const pct = target && target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = target != null && consumed > target;
  return (
    <View style={styles.nutRow}>
      <Text style={styles.nutLabel}>{label}</Text>
      <View style={styles.nutTrack}>
        <View style={[styles.nutFill, { width: `${pct}%` }, over && styles.nutFillOver]} />
      </View>
      <Text style={styles.nutVal}>
        {consumed}
        {target != null ? `/${target}` : ''}{unit}
      </Text>
    </View>
  );
}

/** 주간 식단 코칭 결과 렌더 */
function renderCoach(c: DietCoach) {
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={styles.aiHeadline}>{c.headline}</Text>
      {c.hasData ? (
        <>
          <Text style={styles.aiScore}>영양 균형 점수 {c.balanceScore}/100</Text>
          {c.tips.map((tip, i) => (
            <Text key={i} style={styles.aiTip}>
              • {tip}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

/** 커플 주간 레터 렌더 */
function renderLetter(l: WeeklyLetter) {
  return <Text style={styles.aiLetter}>{l.letter}</Text>;
}

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

  // 영양 목표 대시보드
  const [nutrition, setNutrition] = useState<NutritionSummary | null>(null);
  const [nutModal, setNutModal] = useState(false);
  const [tCal, setTCal] = useState('');
  const [tCarbs, setTCarbs] = useState('');
  const [tProtein, setTProtein] = useState('');
  const [tFat, setTFat] = useState('');
  const [savingNut, setSavingNut] = useState(false);

  const refreshExtras = useCallback(() => {
    streakApi.mealMe().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.mealCouple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    dietApi.coupleGoal().then(setGoal).catch(() => setGoal(null));
    dietApi.nutrition().then(setNutrition).catch(() => setNutrition(null));
  }, []);

  const openNutModal = () => {
    setTCal(nutrition?.targetCalories ? String(nutrition.targetCalories) : '');
    setTCarbs(nutrition?.targetCarbs ? String(nutrition.targetCarbs) : '');
    setTProtein(nutrition?.targetProtein ? String(nutrition.targetProtein) : '');
    setTFat(nutrition?.targetFat ? String(nutrition.targetFat) : '');
    setNutModal(true);
  };

  const onSaveNutGoal = async () => {
    setSavingNut(true);
    try {
      const updated = await dietApi.setNutritionGoal({
        targetCalories: tCal ? Number(tCal) : undefined,
        targetCarbs: tCarbs ? Number(tCarbs) : undefined,
        targetProtein: tProtein ? Number(tProtein) : undefined,
        targetFat: tFat ? Number(tFat) : undefined,
      });
      setNutrition(updated);
      haptics.success();
      toast.success('목표를 저장했어요 ');
      setNutModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '목표 저장에 실패했어요.'));
    } finally {
      setSavingNut(false);
    }
  };

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
      toast.success(`커플 식단 목표: 주 ${days}일 `);
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
          <Text style={styles.link}>통계</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('DietCalendar')}>
          <Text style={styles.link}>캘린더</Text>
        </TouchableOpacity>
      </View>

      {/* AI 인사이트 — 주간 식단 코칭 / 커플 주간 레터 */}
      <View style={styles.aiRow}>
        <AiInsightButton
          label="주간 식단 코칭"
          title="주간 식단 코칭"
          fetcher={dietApi.coach}
          render={renderCoach}
          style={styles.aiBtn}
        />
        <AiInsightButton
          label="커플 주간 레터"
          title="우리 주간 레터"
          fetcher={summaryApi.aiLetter}
          render={renderLetter}
          style={styles.aiBtn}
        />
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
            {/* 오늘 영양 목표 대시보드 */}
            {nutrition ? (
              <Pressable style={styles.nutCard} onPress={openNutModal}>
                <View style={styles.nutHeader}>
                  <Text style={styles.nutTitle}>오늘 영양</Text>
                  <Text style={styles.nutSet}>
                    {nutrition.targetCalories ? '목표 수정' : '목표 설정 ›'}
                  </Text>
                </View>
                <NutritionBar label="칼로리" consumed={nutrition.consumedCalories} target={nutrition.targetCalories} unit="kcal" />
                <NutritionBar label="탄수" consumed={nutrition.consumedCarbs} target={nutrition.targetCarbs} unit="g" />
                <NutritionBar label="단백" consumed={nutrition.consumedProtein} target={nutrition.targetProtein} unit="g" />
                <NutritionBar label="지방" consumed={nutrition.consumedFat} target={nutrition.targetFat} unit="g" />
                {nutrition.targetCalories ? (
                  <Text style={styles.nutRemain}>
                    남은 칼로리 {Math.max(0, nutrition.targetCalories - nutrition.consumedCalories)}kcal
                  </Text>
                ) : null}
              </Pressable>
            ) : null}

            {/* 식단 스트릭 */}
            <View style={styles.streakRow}>
              <Text style={styles.streakText}>연속 {myStreak?.currentCount ?? 0}일</Text>
              {goal?.connected ? (
                <Text style={styles.streakText}>함께 {coupleStreak?.currentCount ?? 0}일</Text>
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
                        이번 주 함께 식단 {goal.bothDays}/{goal.goalDays}일
                      </Text>
                      {goal.achieved ? <Text style={styles.goalBadge}>달성! </Text> : null}
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
                    <Text style={styles.goalTitle}>커플 식단 목표를 정해볼까요?</Text>
                    <Text style={styles.goalSet}>설정하기 ›</Text>
                  </View>
                )}
              </Pressable>
            ) : null}

            {/* 기록이 하나도 없으면 섹션을 숨긴다 — "오늘 없어요" 카드와 EmptyState 가
                겹쳐 빈 안내가 두 번 보이던 중복 제거 (ListEmptyComponent 하나로 통일) */}
            {today.length > 0 || history.length > 0 ? (
              <>
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
                    <Text style={styles.emptyText}>오늘 식단 기록이 아직 없어요 </Text>
                  </View>
                )}
                <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <MealCard meal={item} onLongPress={onLongPress} showDate />}
        ListEmptyComponent={
          !loading ? (
            <EmptyState icon="silverware-fork-knife" title="아직 식단 기록이 없어요" description="아래 버튼으로 첫 식단을 기록해보세요!" />
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
            <Text style={styles.modalTitle}>커플 식단 목표 </Text>
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

      {/* 영양 목표 설정 모달 */}
      <Modal visible={nutModal} transparent animationType="fade" onRequestClose={() => setNutModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setNutModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>하루 영양 목표</Text>
            <Text style={styles.modalDesc}>비워두면 해당 항목은 목표 없이 섭취량만 표시돼요.</Text>
            <View style={styles.nutFormRow}>
              <View style={styles.nutFormItem}>
                <TextField label="칼로리" value={tCal} onChangeText={setTCal} keyboardType="number-pad" />
              </View>
              <View style={styles.nutFormItem}>
                <TextField label="탄수(g)" value={tCarbs} onChangeText={setTCarbs} keyboardType="number-pad" />
              </View>
            </View>
            <View style={styles.nutFormRow}>
              <View style={styles.nutFormItem}>
                <TextField label="단백(g)" value={tProtein} onChangeText={setTProtein} keyboardType="number-pad" />
              </View>
              <View style={styles.nutFormItem}>
                <TextField label="지방(g)" value={tFat} onChangeText={setTFat} keyboardType="number-pad" />
              </View>
            </View>
            <Button title="저장" onPress={onSaveNutGoal} loading={savingNut} style={styles.nutSaveBtn} />
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
  nutCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  nutHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  nutTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  nutSet: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  nutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nutLabel: { width: 36, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  nutTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  nutFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  nutFillOver: { backgroundColor: colors.primary },
  nutVal: { width: 92, textAlign: 'right', fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  nutRemain: { fontSize: fontSize.caption, color: colors.accent, fontWeight: '800', textAlign: 'right', marginTop: spacing.xs },
  nutFormRow: { flexDirection: 'row', gap: spacing.sm },
  nutFormItem: { flex: 1 },
  nutSaveBtn: { marginTop: spacing.sm },
  aiRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  aiBtn: { flex: 1 },
  aiHeadline: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
  aiScore: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  aiTip: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  aiLetter: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 24 },
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
