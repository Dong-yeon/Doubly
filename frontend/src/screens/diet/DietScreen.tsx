/**
 * 럽바디 메인 — 식단 기록(오늘 + 히스토리 + 스트릭/커플 목표 + 캘린더/통계) + 운동 체크인.
 *
 * <p>운동 탭이 없어지면서 이 화면이 <b>탭의 첫 화면</b>이 됐다
 * (docs/ALBUM_TAB_IA_2026-09-14.md 5-2). 운동은 상단 체크인 카드 하나로 들어오고,
 * 루틴·회복·히스토리 같은 정밀 경로는 그 카드의 "운동 홈 ›"에 그대로 있다.
 * 세그먼트 토글은 만들지 않는다 — 식단 메인이 곧 럽바디 메인이다.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HealthStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { MealCard } from '../../components/MealCard';
import { MaterialCommunityIcons } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { AiInsightButton } from '../../components/AiInsightButton';
import { ProteinRing } from '../../components/ProteinRing';
import { WorkoutCheckinCard } from '../../components/workout/WorkoutCheckinCard';
import { useDietStore } from '../../store/dietStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { useRelationStore } from '../../store/relationStore';
import { useDeleteAction } from '../../hooks/useDeleteAction';
import { dietApi } from '../../api/diet';
import { waterApi } from '../../api/water';
import { fastingApi } from '../../api/fasting';
import { summaryApi } from '../../api/summary';
import { streakApi } from '../../api/streak';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { confirmDiscard } from '../../utils/discardGuard';
import { formatKcal, formatKcalOfGoal, formatNumber } from '../../utils/format';
import { sanitizeIntegerInput } from '../../utils/numericInput';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type {
  ActivityLevel,
  CoupleMealGoal,
  DietCoach,
  DietGoalType,
  FastingPlan,
  FastingStatus,
  MacroPreset,
  Meal,
  NutritionSummary,
  PartnerFasting,
  Streak,
  WaterSummary,
  WeeklyLetter,
} from '../../types';
import { themedStyles } from '../../theme/themedStyles';
import { onColor } from '../../theme/onColor';
import { layout } from '../../theme/layout';

/** 목표 대비 섭취 바 */
function NutritionBar({ label, consumed, target, unit }: { label: string; consumed: number; target?: number | null; unit: string }) {
  const pct = target && target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = target != null && consumed > target;
  return (
    <View style={styles.nutRow}>
      <Text style={styles.nutLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.nutTrack}>
        <View style={[styles.nutFill, { width: `${pct}%` }, over && styles.nutFillOver]} />
      </View>
      {/* 표기는 format 유틸로 통일 — 한 화면 안에서 kcal 표기가 세 갈래였다 */}
      <Text style={styles.nutVal}>
        {unit === 'kcal' ? formatKcalOfGoal(consumed, target) : `${formatNumber(consumed)}${target != null ? ` / ${formatNumber(target)}` : ''}${unit}`}
      </Text>
    </View>
  );
}

/** 분 → "H시간 M분" (음수면 부호 없이, 호출부에서 "초과"를 붙인다) */
function formatHM(min: number): string {
  const abs = Math.abs(Math.round(min));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
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

/*
 * 이 화면만 넓은 쪽(HealthStackParamList)으로 타이핑한다 — 운동 체크인 카드에서
 * WorkoutMain·WorkoutRecord·WorkoutSession 으로 가야 하기 때문이다. 나머지 식단·운동
 * 화면은 각자 좁은 파람리스트를 그대로 쓴다(navigation/types.ts 주석).
 */
type Props = NativeStackScreenProps<HealthStackParamList, 'DietMain'>;

export function DietScreen({ navigation }: Props) {
  const {
    today,
    history,
    loading,
    loadingMore,
    historyError,
    fetchToday,
    fetchHistory,
    loadMoreHistory,
    remove,
  } = useDietStore();
  const setDietGoal = useRelationStore((s) => s.setDietGoal);
  // 삭제 in-flight 가드 — 연타로 인한 중복 DELETE 방지 + 해당 카드만 흐리게 (QA_CHECKLIST.md 패턴 7)
  const { deletingId, runDelete } = useDeleteAction<number>();
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
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // 목표 칼로리 자동 계산(TDEE 마법사) — 계산만 하고, 확정 저장은 기존 목표 모달의 "저장"으로 한다
  const [wizardModal, setWizardModal] = useState(false);
  const [wizActivity, setWizActivity] = useState<ActivityLevel>('MODERATE');
  const [wizGoalType, setWizGoalType] = useState<DietGoalType>('MAINTAIN');
  const [wizRate, setWizRate] = useState(0.5);
  const [wizPreset, setWizPreset] = useState<MacroPreset>('BALANCED');
  const [calculating, setCalculating] = useState(false);

  // 물 섭취 트래커
  const [water, setWater] = useState<WaterSummary | null>(null);
  const refreshWater = useCallback(() => {
    waterApi.today().then(setWater).catch(() => setWater(null));
  }, []);

  // 간헐적 단식 타이머
  const [fasting, setFasting] = useState<FastingStatus | null>(null);
  const [partnerFasting, setPartnerFasting] = useState<PartnerFasting | null>(null);
  const [fastingModal, setFastingModal] = useState(false);
  const [fastingBusy, setFastingBusy] = useState(false);
  const [customHours, setCustomHours] = useState('16');
  const refreshFasting = useCallback(() => {
    fastingApi.active().then(setFasting).catch(() => setFasting(null));
    fastingApi.partner().then(setPartnerFasting).catch(() => setPartnerFasting(null));
  }, []);

  // 진행 중일 때만 1분마다 화면을 다시 그려 경과 시간을 갱신한다(재조회 없이 클라이언트에서 계산)
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!fasting?.active) return;
    const id = setInterval(() => forceTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, [fasting?.active]);

  const liveElapsedMin =
    fasting?.active && fasting.startedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(fasting.startedAt).getTime()) / 60000))
      : (fasting?.elapsedMin ?? 0);

  /*
   * 오늘 운동 기록 — 상단 체크인 카드가 "챙겼는지"를 이 값으로 가른다. 카드가 스스로
   * 부르지 않고 화면이 부른다: 운동 홈도 같은 카드를 쓰는데 양쪽이 다 조회하면 그 화면에서
   * 같은 요청이 두 번 나간다(WorkoutCheckinCard 주석).
   */
  const fetchWorkoutToday = useWorkoutStore((s) => s.fetchToday);

  const refreshExtras = useCallback(() => {
    fetchWorkoutToday();
    streakApi.mealMe().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.mealCouple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    dietApi.coupleGoal().then(setGoal).catch(() => setGoal(null));
    dietApi.nutrition().then(setNutrition).catch(() => setNutrition(null));
    refreshWater();
    refreshFasting();
  }, [refreshWater, refreshFasting, fetchWorkoutToday]);

  // 모달을 연 시점의 목표 스냅샷 — 백드롭으로 닫을 때 "달라진 게 있는지"를 판단한다
  const nutInitialRef = useRef('');

  const openNutModal = () => {
    const cal = nutrition?.targetCalories ? String(nutrition.targetCalories) : '';
    const carbs = nutrition?.targetCarbs ? String(nutrition.targetCarbs) : '';
    const protein = nutrition?.targetProtein ? String(nutrition.targetProtein) : '';
    const fat = nutrition?.targetFat ? String(nutrition.targetFat) : '';
    setTCal(cal);
    setTCarbs(carbs);
    setTProtein(protein);
    setTFat(fat);
    nutInitialRef.current = [cal, carbs, protein, fat].join('|');
    setNutModal(true);
  };

  // 백드롭·Android 백 공용 — 입력이 달라졌으면 확인 후 닫는다
  const closeNutModal = () =>
    confirmDiscard([tCal, tCarbs, tProtein, tFat].join('|') !== nutInitialRef.current, () =>
      setNutModal(false),
    );

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
      toast.success('목표를 저장했어요');
      setNutModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '목표 저장에 실패했어요.'));
    } finally {
      setSavingNut(false);
    }
  };

  // 목표 칼로리 자동 계산 — 결과를 목표 모달 입력칸에 채워만 준다. 저장은 사용자가 "저장" 버튼으로.
  const onCalculateGoal = async () => {
    setCalculating(true);
    try {
      const res = await dietApi.suggestNutritionGoal({
        activityLevel: wizActivity,
        goalType: wizGoalType,
        weeklyRateKg: wizGoalType === 'MAINTAIN' ? undefined : wizRate,
        macroPreset: wizPreset,
      });
      if (res.targetCalories == null) {
        toast.error(res.message || '계산에 필요한 정보가 부족해요.');
        return;
      }
      setTCal(String(res.targetCalories));
      setTCarbs(String(res.targetCarbs));
      setTProtein(String(res.targetProtein));
      setTFat(String(res.targetFat));
      haptics.success();
      toast.success('계산했어요. 확인 후 저장해주세요');
      setWizardModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '계산에 실패했어요.'));
    } finally {
      setCalculating(false);
    }
  };

  // 물 섭취 +/- — 실패해도 조용히 되돌리지 않고 에러만 안내(연타 시 중복 요청은 서버가 누적 처리)
  const onAddWater = async (amountMl: number) => {
    try {
      const res = await waterApi.add(amountMl);
      setWater(res);
      haptics.light();
    } catch (e) {
      toast.error(getErrorMessage(e, '물 섭취 기록에 실패했어요.'));
    }
  };

  const onStartFasting = async (planType: FastingPlan) => {
    setFastingBusy(true);
    try {
      const hours = planType === 'CUSTOM' ? Number(customHours) : undefined;
      const res = await fastingApi.start(planType, hours);
      setFasting(res);
      haptics.success();
      toast.success(`${res.planLabel} 단식을 시작했어요`);
      setFastingModal(false);
    } catch (e) {
      toast.error(getErrorMessage(e, '단식 시작에 실패했어요.'));
    } finally {
      setFastingBusy(false);
    }
  };

  const onEndFasting = () => {
    Alert.alert('단식 종료', '지금 단식을 종료할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '종료',
        onPress: async () => {
          try {
            const res = await fastingApi.end();
            setFasting({ ...res, active: false });
            haptics.success();
            toast.success(res.achieved ? '목표 시간을 채웠어요!' : '단식을 종료했어요.');
          } catch (e) {
            toast.error(getErrorMessage(e, '단식 종료에 실패했어요.'));
          }
        },
      },
    ]);
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
      toast.success(`커플 식단 목표: 주 ${days}일`);
      setGoalModal(false);
      refreshExtras();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingGoal(false);
    }
  };

  // 탭하면 그 기록을 채운 수정 화면으로. 길게 누르면 삭제(기존 동작 유지)
  const onEdit = (m: Meal) => navigation.navigate('DietRecord', { meal: m });

  // 카드의 장소 태그 — 럽슐랭 탭과 공유하는 화면이라 이 스택에 그대로 쌓인다(navigation/types.ts 참고)
  const onPlacePress = (m: Meal) => {
    if (m.placeId && m.placeName) navigation.navigate('PlaceDetail', { placeId: m.placeId, name: m.placeName });
  };

  const onLongPress = (m: Meal) => {
    Alert.alert('식단 기록 삭제', `${m.mealTypeLabel} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        // useDeleteAction 이 in-flight 가드 + 기본 에러 토스트를 처리한다 (QA_CHECKLIST.md 패턴 7)
        onPress: () => runDelete(m.id, () => remove(m.id), '식단 기록을 삭제하지 못했어요.'),
      },
    ]);
  };

  const todayCalories = today.reduce((sum, m) => sum + (m.calories ?? 0), 0);

  // 어제 식단을 오늘 날짜로 통째로 복사 — 매일 비슷한 식단을 먹는 유저를 위한 3초 퀵 로깅
  const onCopyYesterday = async () => {
    setCopyingYesterday(true);
    try {
      const copied = await dietApi.copyFromYesterday();
      haptics.success();
      toast.success(`어제 식단 ${copied.length}개를 불러왔어요`);
      fetchToday();
      fetchHistory();
    } catch (e) {
      toast.error(getErrorMessage(e, '어제 식단을 불러오지 못했어요.'));
    } finally {
      setCopyingYesterday(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/*
        화면 안 헤더 — 우리 탭과 같은 문법(제목 + 우측 아이콘). 예전엔 제목 없이 카드에서
        시작했고 통계·캘린더는 칩 줄, AI 버튼 둘은 그 아래 고정 줄이라 목록 위 고정 영역이
        세 줄(≈250px)이었다(docs/SCREEN_DESIGN_PASS_2026-09-23.md §6). 지금 고정은 제목 + 체크인뿐.
      */}
      <View style={styles.topBar}>
        <Text style={styles.topTitle}>럽바디</Text>
        <View style={styles.topButtons}>
          <Pressable
            onPress={() => navigation.navigate('DietStats')}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="식단 통계"
          >
            <MaterialCommunityIcons name="chart-bar" size={24} color={colors.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('DietCalendar')}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="식단 캘린더"
          >
            <MaterialCommunityIcons name="calendar-blank-outline" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>
      </View>

      {/*
        운동 체크인 — 운동 탭이 이 탭으로 흡수된 자리(ALBUM_TAB_IA_2026-09-14.md 5-2).
        맨 위에 두는 이유: 하루 한 번의 "챙겼다"가 운동에서 가장 자주 하는 동작이고,
        식단은 아래 목록·기록 버튼이 이미 화면 전체를 차지하고 있다. 자세한 기록은
        카드의 "운동 홈 ›"으로.
      */}
      <View style={styles.workoutCheckin}>
        <WorkoutCheckinCard
          onOpenRecord={(params) => navigation.navigate('WorkoutRecord', params)}
          onResume={() => navigation.navigate('WorkoutSession', { resume: true })}
          onOpenWorkoutHome={() => navigation.navigate('WorkoutMain')}
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
          refreshExtras();
        }}
        onEndReachedThreshold={0.3}
        onEndReached={loadMoreHistory}
        ListHeaderComponent={
          <View>
            {/* AI 인사이트 — 주간 식단 코칭 / 커플 주간 레터. 목록과 함께 스크롤된다 */}
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

            {/* 식단 스트릭 — 운동 홈과 같은 표시 형식(연속/함께/최고) */}
            <View style={styles.streakRow}>
              <Text style={styles.streakText}>연속 {myStreak?.currentCount ?? 0}일</Text>
              {goal?.connected ? (
                <Text style={styles.streakText}>함께 {coupleStreak?.currentCount ?? 0}일</Text>
              ) : null}
              <Text style={styles.streakMax}>최고 {myStreak?.maxCount ?? 0}일</Text>
            </View>

            {/* 오늘 영양 목표 대시보드 */}
            {nutrition ? (
              <View style={styles.nutCard}>
                <View style={styles.nutHeader}>
                  <Text style={styles.nutTitle}>오늘 영양</Text>
                  {/* 카드 전체를 누르면 정보를 읽으려다 실수로 모달이 열렸다 — 버튼만 탭 영역으로 좁힌다 */}
                  <TouchableOpacity onPress={openNutModal} hitSlop={8} accessibilityRole="button" style={styles.nutSetBtn}>
                    <Text style={styles.nutSet}>{nutrition.targetCalories ? '목표 수정' : '목표 설정'}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                {nutrition.travelMode ? (
                  <Text style={styles.travelModeBadge}>
                    여행 모드 중 · {nutrition.travelModeTripTitle} — 목표는 잠깐 쉬어가요
                  </Text>
                ) : null}
                <View style={styles.nutMain}>
                  {/* 단백질만 원형 게이지로 분리 — 운동 유저는 단백질 달성률에 가장 민감하다 */}
                  <ProteinRing consumed={nutrition.consumedProtein} target={nutrition.targetProtein} />
                  <View style={styles.nutSecondary}>
                    <NutritionBar label="칼로리" consumed={nutrition.consumedCalories} target={nutrition.targetCalories} unit="kcal" />
                    <NutritionBar label="탄수" consumed={nutrition.consumedCarbs} target={nutrition.targetCarbs} unit="g" />
                    <NutritionBar label="지방" consumed={nutrition.consumedFat} target={nutrition.targetFat} unit="g" />
                  </View>
                </View>
                {nutrition.targetCalories ? (
                  <Text style={styles.nutRemain}>
                    남은 칼로리 {formatKcal(Math.max(0, nutrition.targetCalories - nutrition.consumedCalories))}
                  </Text>
                ) : null}

                {/* 당류/나트륨/식이섬유 — 목표(target) 없이 오늘 합계만 참고하는 정보성 지표라
                    게이지 없이 한 줄로만 보여준다. */}
                {nutrition.consumedSugar > 0 || nutrition.consumedSodium > 0 || nutrition.consumedFiber > 0 ? (
                  <Text style={styles.extraNutrients}>
                    당류 {formatNumber(nutrition.consumedSugar)}g · 나트륨 {formatNumber(nutrition.consumedSodium)}mg
                    {' '}· 식이섬유 {formatNumber(nutrition.consumedFiber)}g
                  </Text>
                ) : null}

                {/* 실시간 에너지 밸런스 — 기초대사량 + 오늘 운동 소모 - 섭취. 수동 목표와 별개로,
                    "오늘 움직인 만큼" 반영된 잔여 칼로리를 보여준다. 프로필(키/생년월일/성별)이나
                    체중 기록이 없으면 계산할 수 없어 등록 안내만 노출한다. */}
                <View style={styles.energyBox}>
                  {nutrition.bmr != null ? (
                    <>
                      <Text style={styles.energyFormula}>
                        기초대사량 {nutrition.bmr} + 운동 소모 {nutrition.exerciseCalories} − 섭취 {nutrition.consumedCalories}
                      </Text>
                      <Text style={styles.energyResult}>
                        {(nutrition.energyBalance ?? 0) >= 0
                          ? `오늘 ${nutrition.energyBalance}kcal 더 섭취 가능`
                          : `목표보다 ${Math.abs(nutrition.energyBalance ?? 0)}kcal 더 먹었어요`}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.energyHint}>
                      MY › 신체 정보를 등록하면 오늘 운동한 만큼 섭취 가능 칼로리를 계산해요.
                    </Text>
                  )}
                </View>
              </View>
            ) : null}

            {/*
              물 + 간헐적 단식 — 한 카드 안의 <b>한 줄 타일 둘</b>. 예전엔 제목·목표·상대·진행 막대·
              버튼 셋이 한 트래커마다 있어 카드 하나가 화면의 1/3 이었다(docs/SCREEN_DESIGN_PASS
              _2026-09-23.md §6-3). 물은 −/+ 스테퍼(250ml), 단식은 시작/종료 한 버튼이다.
            */}
            <View style={styles.trackerCard}>
              {water ? (
                <View style={styles.trackerRow}>
                  <View style={styles.trackerText}>
                    <Text style={styles.trackerTitle}>
                      물{'  '}
                      <Text style={styles.trackerValue}>
                        {formatNumber(water.consumedMl)} / {formatNumber(water.targetMl)}ml
                      </Text>
                    </Text>
                    {water.coupleConnected ? (
                      <Text style={styles.trackerSub}>상대 {formatNumber(water.partnerConsumedMl ?? 0)}ml</Text>
                    ) : null}
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed, water.consumedMl <= 0 && styles.stepBtnDisabled]}
                      onPress={() => onAddWater(-250)}
                      disabled={water.consumedMl <= 0}
                      accessibilityRole="button"
                      accessibilityLabel="물 250ml 빼기"
                    >
                      <MaterialCommunityIcons name="minus" size={18} color={colors.textPrimary} />
                    </Pressable>
                    <Text style={styles.stepLabel}>250</Text>
                    <Pressable
                      style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
                      onPress={() => onAddWater(250)}
                      accessibilityRole="button"
                      accessibilityLabel="물 250ml 더하기"
                    >
                      <MaterialCommunityIcons name="plus" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {water ? <View style={styles.trackerDivider} /> : null}

              {/* 간헐적 단식 — 세션이 서버에 살아있어 커플 상대방 진행 상태도 함께 보여준다 */}
              {fasting?.active ? (
                <View style={styles.trackerRow}>
                  <View style={styles.trackerText}>
                    <Text style={styles.trackerTitle}>
                      {fasting.planLabel} 단식 중{'  '}
                      <Text style={styles.trackerValue}>{formatHM(liveElapsedMin)} 경과</Text>
                    </Text>
                    <Text style={styles.trackerSub}>
                      {fasting.achieved
                        ? '목표 달성!'
                        : `목표 ${fasting.targetHours}시간 · ${formatHM((fasting.targetHours ?? 0) * 60 - liveElapsedMin)} 남음`}
                      {partnerFasting?.connected && partnerFasting.active
                        ? ` · 상대 ${formatHM(partnerFasting.elapsedMin ?? 0)} 경과`
                        : ''}
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.trackerAction, pressed && styles.stepBtnPressed]}
                    onPress={onEndFasting}
                    accessibilityRole="button"
                    accessibilityLabel="단식 종료"
                  >
                    <Text style={styles.trackerActionText}>종료</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [styles.trackerRow, pressed && styles.trackerRowPressed]}
                  onPress={() => setFastingModal(true)}
                  accessibilityRole="button"
                  accessibilityLabel="간헐적 단식 시작하기"
                >
                  <View style={styles.trackerText}>
                    <Text style={styles.trackerTitle}>간헐적 단식</Text>
                    {partnerFasting?.connected && partnerFasting.active ? (
                      <Text style={styles.trackerSub}>
                        상대 {partnerFasting.partnerName}님은 지금 단식 중 · {formatHM(partnerFasting.elapsedMin ?? 0)} 경과
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.trackerActionText}>시작</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
                </Pressable>
              )}
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
                      {goal.achieved ? <Text style={styles.goalBadge}>달성!</Text> : null}
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
                    <Text style={styles.goalTitle}>커플 식단 목표</Text>
                    <View style={styles.goalSetRow}>
                      <Text style={styles.goalSet}>설정</Text>
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
                    </View>
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
                  <View style={styles.todayHeaderRight}>
                    {todayCalories > 0 ? (
                      <Text style={styles.todayCal}>총 {formatKcal(todayCalories)}</Text>
                    ) : null}
                    <TouchableOpacity onPress={onCopyYesterday} disabled={copyingYesterday}>
                      <Text style={styles.copyYesterday}>
                        {copyingYesterday ? '불러오는 중…' : '어제 식단 불러오기'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {today.length > 0 ? (
                  today.map((m) => (
                    <MealCard
                      key={m.id}
                      meal={m}
                      onPress={onEdit}
                      onLongPress={onLongPress}
                      onPlacePress={onPlacePress}
                      deleting={deletingId === m.id}
                    />
                  ))
                ) : (
                  <View style={styles.emptyToday}>
                    <Text style={styles.emptyText}>오늘 식단 기록이 아직 없어요</Text>
                  </View>
                )}
                <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <MealCard
            meal={item}
            onPress={onEdit}
            onLongPress={onLongPress}
            onPlacePress={onPlacePress}
            showDate
            deleting={deletingId === item.id}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            // 로드 실패를 "진짜 빈 목록"과 구분해 재시도를 준다 (QA_CHECKLIST.md 패턴 1)
            historyError ? (
              <EmptyState
                icon="cloud-off-outline"
                title="식단 기록을 불러오지 못했어요"
                description="네트워크 상태를 확인하고 다시 시도해주세요."
                error
                onRetry={() => {
                  fetchToday();
                  fetchHistory();
                }}
              />
            ) : (
              <EmptyState icon="silverware-fork-knife" title="아직 식단 기록이 없어요" description="아래 버튼으로 첫 식단을 기록해보세요!" />
            )
          ) : null
        }
        ListFooterComponent={loadingMore ? <Text style={styles.footer}>불러오는 중…</Text> : null}
      />

      <View style={styles.fabWrap}>
        <Button
          title="식단 기록하기"
          leftIcon={<MaterialCommunityIcons name="plus" size={20} color={onColor(colors.primaryFill)} />}
          onPress={() => navigation.navigate('DietRecord')}
        />
      </View>

      {/* 커플 목표 설정 모달 */}
      <Modal visible={goalModal} transparent animationType="fade" onRequestClose={() => setGoalModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setGoalModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>커플 식단 목표</Text>
            <Text style={styles.modalDesc}>이번 주에 둘 다 식단을 기록할 목표 일수를 정해요.</Text>
            <View style={styles.dayRow}>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.dayChip, goal?.goalDays === d && styles.dayChipActive]}
                  disabled={savingGoal}
                  onPress={() => onPickGoal(d)}
                  accessibilityState={{ selected: goal?.goalDays === d }}
                >
                  <Text style={[styles.dayText, goal?.goalDays === d && styles.dayTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalHint}>주 {goal?.goalDays ?? '-'}일 · 탭하면 바로 저장돼요</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 영양 목표 설정 모달 — 입력 4개 + 저장 버튼이 키보드에 가리지 않게 감싼다
          (QA_CHECKLIST.md 패턴 4, CoupleCalendarScreen.tsx 모달과 같은 래핑) */}
      <Modal visible={nutModal} transparent animationType="fade" onRequestClose={closeNutModal}>
        <Pressable style={styles.modalBackdrop} onPress={closeNutModal}>
          <KeyboardAvoidingView style={styles.modalAvoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.nutModalHeader}>
              <Text style={styles.modalTitle}>하루 영양 목표</Text>
              <TouchableOpacity onPress={() => setWizardModal(true)}>
                <Text style={styles.wizardLink}>자동 계산</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>비워두면 해당 항목은 목표 없이 섭취량만 표시돼요.</Text>
            <View style={styles.nutFormRow}>
              <View style={styles.nutFormItem}>
                <TextField
                  label="칼로리"
                  value={tCal}
                  onChangeText={(v) => setTCal(sanitizeIntegerInput(v))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.nutFormItem}>
                <TextField
                  label="탄수(g)"
                  value={tCarbs}
                  onChangeText={(v) => setTCarbs(sanitizeIntegerInput(v))}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={styles.nutFormRow}>
              <View style={styles.nutFormItem}>
                <TextField
                  label="단백(g)"
                  value={tProtein}
                  onChangeText={(v) => setTProtein(sanitizeIntegerInput(v))}
                  keyboardType="number-pad"
                />
              </View>
              <View style={styles.nutFormItem}>
                <TextField
                  label="지방(g)"
                  value={tFat}
                  onChangeText={(v) => setTFat(sanitizeIntegerInput(v))}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <Button title="저장" onPress={onSaveNutGoal} loading={savingNut} style={styles.nutSaveBtn} />
          </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 목표 칼로리 자동 계산(TDEE 마법사) — 계산만 하고, 위 목표 모달 입력칸을 채운다.
          저장은 사용자가 위 모달의 "저장" 버튼을 눌러야 확정된다. */}
      <Modal visible={wizardModal} transparent animationType="fade" onRequestClose={() => setWizardModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setWizardModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>목표 칼로리 자동 계산</Text>
            <Text style={styles.modalDesc}>
              기초대사량(BMR) × 활동량으로 하루 소비 칼로리를 추정해 목표를 제안해요.
            </Text>

            <Text style={styles.wizardLabel}>활동량</Text>
            <View style={styles.wizardChipRow}>
              {(
                [
                  ['SEDENTARY', '거의 안 함'],
                  ['LIGHT', '가벼운 운동'],
                  ['MODERATE', '보통'],
                  ['ACTIVE', '활발함'],
                  ['VERY_ACTIVE', '매우 활발'],
                ] as [ActivityLevel, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.wizardChip, wizActivity === value && styles.wizardChipActive]}
                  onPress={() => setWizActivity(value)}
                  accessibilityState={{ selected: wizActivity === value }}
                >
                  <Text style={[styles.wizardChipText, wizActivity === value && styles.wizardChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.wizardLabel}>목표</Text>
            <View style={styles.wizardChipRow}>
              {(
                [
                  ['LOSE', '감량'],
                  ['MAINTAIN', '유지'],
                  ['GAIN', '증량'],
                ] as [DietGoalType, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.wizardChip, wizGoalType === value && styles.wizardChipActive]}
                  onPress={() => setWizGoalType(value)}
                  accessibilityState={{ selected: wizGoalType === value }}
                >
                  <Text style={[styles.wizardChipText, wizGoalType === value && styles.wizardChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.wizardLabel}>탄단지 비율</Text>
            <View style={styles.wizardChipRow}>
              {(
                [
                  ['BALANCED', '균형'],
                  ['LOW_CARB', '저탄고지'],
                  ['HIGH_PROTEIN', '고단백'],
                  ['KETO', '키토'],
                ] as [MacroPreset, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.wizardChip, wizPreset === value && styles.wizardChipActive]}
                  onPress={() => setWizPreset(value)}
                  accessibilityState={{ selected: wizPreset === value }}
                >
                  <Text style={[styles.wizardChipText, wizPreset === value && styles.wizardChipTextActive]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {wizGoalType !== 'MAINTAIN' ? (
              <>
                <Text style={styles.wizardLabel}>주당 {wizGoalType === 'LOSE' ? '감량' : '증량'} 속도</Text>
                <View style={styles.wizardChipRow}>
                  {[0.25, 0.5, 0.75].map((rate) => (
                    <TouchableOpacity
                      key={rate}
                      style={[styles.wizardChip, wizRate === rate && styles.wizardChipActive]}
                      onPress={() => setWizRate(rate)}
                      accessibilityState={{ selected: wizRate === rate }}
                    >
                      <Text style={[styles.wizardChipText, wizRate === rate && styles.wizardChipTextActive]}>
                        {rate}kg
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Button title="계산해서 채우기" onPress={onCalculateGoal} loading={calculating} style={styles.nutSaveBtn} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* 간헐적 단식 시작 — 방식 선택. CUSTOM 만 목표 시간을 직접 입력한다 */}
      <Modal visible={fastingModal} transparent animationType="fade" onRequestClose={() => setFastingModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFastingModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>간헐적 단식 시작</Text>
            <Text style={styles.modalDesc}>방식을 고르면 바로 시작돼요.</Text>
            <View style={styles.wizardChipRow}>
              {(
                [
                  ['SIXTEEN_EIGHT', '16:8'],
                  ['EIGHTEEN_SIX', '18:6'],
                  ['TWENTY_FOUR', '20:4'],
                  ['OMAD', 'OMAD'],
                ] as [FastingPlan, string][]
              ).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={styles.wizardChip}
                  disabled={fastingBusy}
                  onPress={() => onStartFasting(value)}
                >
                  <Text style={styles.wizardChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.wizardLabel}>커스텀 시간</Text>
            <View style={styles.customFastingRow}>
              <View style={styles.customFastingInput}>
                <TextField
                  label="목표 시간"
                  value={customHours}
                  onChangeText={(t) => setCustomHours(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                />
              </View>
              <Button
                title="시작"
                onPress={() => onStartFasting('CUSTOM')}
                loading={fastingBusy}
                style={styles.customFastingBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  // 화면 안 헤더 — AlbumScreen 과 같은 값
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  topTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  topButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topBtn: { minWidth: layout.touchTarget, minHeight: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  topBtnPressed: { opacity: 0.6 },
  // 체크인 카드 자체가 아래 여백(marginBottom)을 갖고 있다
  workoutCheckin: {},
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
  nutSetBtn: { flexDirection: 'row', alignItems: 'center' },
  nutSet: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  nutMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nutSecondary: { flex: 1, gap: spacing.xs },
  travelModeBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  nutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // width 48 — "칼로리"(3글자)가 36px 에서 줄바꿈되어 첫 행만 높이가 달라졌다
  nutLabel: { width: 48, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  nutTrack: { flex: 1, height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  // 내 지표 — 소유자 의미가 없으므로 크롬 채움. 예전 accent(=함께)는 뜻이 없었다
  nutFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryFill },
  nutFillOver: { backgroundColor: colors.primary },
  nutVal: { width: 92, textAlign: 'right', fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  nutRemain: { fontSize: fontSize.caption, color: colors.togetherText, fontWeight: '800', textAlign: 'right', marginTop: spacing.xs },
  extraNutrients: { fontSize: fontSize.micro, color: colors.textTertiary, fontWeight: '600', marginTop: spacing.xs },
  energyBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 2,
  },
  energyFormula: { fontSize: fontSize.micro, color: colors.textTertiary, fontWeight: '600' },
  energyResult: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '800' },
  energyHint: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  nutFormRow: { flexDirection: 'row', gap: spacing.sm },
  nutFormItem: { flex: 1 },
  nutSaveBtn: { marginTop: spacing.sm },
  nutModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wizardLink: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  wizardLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.sm },
  wizardChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  wizardChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  wizardChipActive: { backgroundColor: colors.primaryFill, borderColor: colors.primaryFill },
  wizardChipText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  wizardChipTextActive: { color: onColor(colors.primaryFill), fontWeight: '800' },
  // 물 + 간헐적 단식 트래커 — 한 카드 안에서 구획만 나눈다(물 섹션은 물 데이터가 있을 때만 노출)
  trackerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  trackerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  trackerRowPressed: { opacity: 0.7 },
  trackerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  trackerText: { flex: 1, minWidth: 0 },
  trackerTitle: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  trackerValue: { fontWeight: '600', color: colors.textSecondary },
  trackerSub: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },
  // −/+ 스테퍼 — 250ml 단위. 원 버튼 36 에 hitSlop 없이도 행 높이 44 로 터치를 받는다
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: { backgroundColor: colors.primarySoft },
  stepBtnDisabled: { opacity: 0.35 },
  stepLabel: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, minWidth: 28, textAlign: 'center' },
  trackerAction: { paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: 'center', borderRadius: radius.md },
  trackerActionText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  customFastingRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  customFastingInput: { flex: 1 },
  customFastingBtn: { marginBottom: 2 },
  aiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  aiBtn: { flex: 1 },
  aiHeadline: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
  aiScore: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  aiTip: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  aiLetter: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 24 },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
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
  goalSetRow: { flexDirection: 'row', alignItems: 'center' },
  goalSet: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  // colors.white 는 양 테마 모두 순백 고정이라 다크 카드 위에서 번쩍였다 — nutTrack 과 같은 surfaceAlt 로
  goalTrack: { height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  goalFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  goalSub: { fontSize: fontSize.caption, color: colors.textSecondary },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  todayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  todayCal: { fontSize: fontSize.body, color: colors.togetherText, fontWeight: '800' },
  copyYesterday: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
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
  // colors.backdrop — 하드코딩 rgba 리터럴이 다크모드에서 대비가 안 맞던 문제 (QA_CHECKLIST.md 패턴 8)
  modalBackdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'center', padding: spacing.lg },
  // 키보드 회피 래퍼 — 배경 전체를 덮되(flex:1) 카드는 세로 중앙에 둔다 (패턴 4)
  modalAvoid: { flex: 1, justifyContent: 'center' },
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
  // 커플 공동 목표의 선택 — 함께 색(togetherFill). accent 는 테마 강조색이라 소유자 뜻이 없다
  dayChipActive: { backgroundColor: colors.togetherFill, borderColor: colors.togetherFill },
  dayText: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  // 다크 채움 위 white 는 대비가 모자랄 수 있다 — 배경 휘도로 고른다
  dayTextActive: { color: onColor(colors.togetherFill) },
  modalHint: { fontSize: fontSize.caption, color: colors.textTertiary, textAlign: 'center' },
}));
