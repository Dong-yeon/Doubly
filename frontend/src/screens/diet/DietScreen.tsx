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
import { NutritionRing } from '../../components/NutritionRing';
import { WorkoutCheckinCard } from '../../components/workout/WorkoutCheckinCard';
import { WeekStrip } from '../../components/WeekStrip';
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
import { WORKOUT_HOME_ENABLED } from '../../constants/config';
import { onColor } from '../../theme/onColor';
import { layout } from '../../theme/layout';

/** 목표 대비 섭취 바 */
function NutritionBar({
  label,
  consumed,
  target,
  unit,
  overIsBad = true,
}: {
  label: string;
  consumed: number;
  target?: number | null;
  unit: string;
  /** 넘으면 강조할지 — 단백질은 넘는 게 나쁜 일이 아니라 초과색을 쓰지 않는다 */
  overIsBad?: boolean;
}) {
  const pct = target && target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
  const over = overIsBad && target != null && consumed > target;
  return (
    <View
      style={styles.nutRow}
      accessible
      accessibilityLabel={`${label} ${formatNumber(consumed)}${unit}${target != null ? `, 목표 ${formatNumber(target)}${unit}` : ''}`}
    >
      {/*
        [라벨 ··· 값] 한 줄 + 그 아래 막대. 예전엔 라벨·막대·값을 한 줄에 고정 폭(48·92)으로 놓아 큰 글자에서
        잘렸고, 링이 커진 뒤 360 폭에서는 막대 칸이 남지 않았다(§3 A-10). 세 줄 높이가 링 높이 안에 든다.
      */}
      <View style={styles.nutRowHead}>
        <Text style={styles.nutLabel}>{label}</Text>
        {/* 표기는 format 유틸로 통일 — 한 화면 안에서 kcal 표기가 세 갈래였다 */}
        <Text style={styles.nutVal}>
          {unit === 'kcal' ? formatKcalOfGoal(consumed, target) : `${formatNumber(consumed)}${target != null ? ` / ${formatNumber(target)}` : ''}${unit}`}
        </Text>
      </View>
      <View style={styles.nutTrack}>
        <View style={[styles.nutFill, { width: `${pct}%` }, over && styles.nutFillOver]} />
      </View>
    </View>
  );
}

/** 계산식 시트의 한 줄 */
function FormulaRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.formulaRow}>
      <Text style={[styles.formulaLabel, strong && styles.formulaStrong]}>{label}</Text>
      <Text style={[styles.formulaValue, strong && styles.formulaStrong]}>{value}</Text>
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

/** 카드 하나의 첫 로드 상태 — 실패를 "카드가 없다"로 숨기지 않으려고 따로 든다(§3 A-6) */
type LoadState = 'loading' | 'ok' | 'error';

/** 첫 로드 동안의 자리 — 고정 높이라 데이터가 들어와도 아래 목록이 덜 출렁인다 */
function CardSkeleton({ height }: { height: number }) {
  return <View style={[styles.skeleton, { height }]} accessibilityLabel="불러오는 중" />;
}

/** 조회 실패 — 카드 자리에 한 줄. 예전엔 .catch 가 null 을 넣어 카드가 조용히 사라졌다 */
function LoadErrorRow({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.loadError, pressed && styles.trackerRowPressed]}
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel={`${what} 불러오기 실패. 다시 시도`}
    >
      <MaterialCommunityIcons name="cloud-off-outline" size={18} color={colors.textSecondary} />
      <Text style={styles.loadErrorText}>{what} · 불러오지 못했어요</Text>
      <Text style={styles.trackerActionText}>다시</Text>
    </Pressable>
  );
}

/**
 * 단식 진행 줄 — 경과 시간을 <b>이 컴포넌트 안에서만</b> 1분마다 다시 그린다.
 * 예전엔 화면 전체의 상태(forceTick)여서 1분마다 영양 카드·식사 카드·모달 셋까지 다시 그렸다(§3 A-12).
 */
function FastingActiveRow({
  fasting,
  partnerFasting,
  onEnd,
}: {
  fasting: FastingStatus;
  partnerFasting: PartnerFasting | null;
  onEnd: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);
  const elapsedMin = fasting.startedAt
    ? Math.max(0, Math.floor((now - new Date(fasting.startedAt).getTime()) / 60000))
    : (fasting.elapsedMin ?? 0);
  return (
    <View style={styles.trackerRow}>
      <View style={styles.trackerText}>
        <Text style={styles.trackerTitle}>
          {fasting.planLabel} 단식 중{'  '}
          <Text style={styles.trackerValue}>{formatHM(elapsedMin)} 경과</Text>
        </Text>
        <Text style={styles.trackerSub}>
          {fasting.achieved
            ? '목표 달성!'
            : `목표 ${fasting.targetHours}시간 · ${formatHM((fasting.targetHours ?? 0) * 60 - elapsedMin)} 남음`}
          {partnerFasting?.connected && partnerFasting.active
            ? ` · 상대 ${formatHM(partnerFasting.elapsedMin ?? 0)} 경과`
            : ''}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.trackerAction, pressed && styles.stepBtnPressed]}
        onPress={onEnd}
        accessibilityRole="button"
        accessibilityLabel="단식 종료"
      >
        <Text style={styles.trackerActionText}>종료</Text>
      </Pressable>
    </View>
  );
}

/**
 * 칼로리 링의 가운데·아래 글자 — 결정(2026-10-02): 중심 = <b>목표 − 섭취</b>. 운동 소모는 더하지 않는다.
 * 체크인 시간 칩의 소모 칼로리는 "시간 × 가정 MET" 추정이라, 더하면 "더 먹어도 된다"로 과하게 읽힌다.
 * 운동은 링 아래 캡션으로 따로 보여준다. 방향이 증량이면 남은 양을 "더 드세요"로 말한다.
 */
function calorieRing(n: NutritionSummary) {
  const target = n.targetCalories ?? null;
  const consumed = n.consumedCalories;
  const gain = n.goalDirection === 'GAIN';
  if (!target) {
    return {
      progress: null,
      over: false,
      value: formatNumber(consumed),
      label: 'kcal 먹었어요',
      a11y: `오늘 섭취 ${formatNumber(consumed)}킬로칼로리, 목표 없음`,
    };
  }
  const remain = target - consumed;
  if (remain >= 0) {
    return {
      progress: consumed / target,
      over: false,
      value: formatNumber(remain),
      label: gain ? 'kcal 더 드세요' : 'kcal 남았어요',
      a11y: `${gain ? '더 먹을' : '남은'} 칼로리 ${formatNumber(remain)}, 목표 ${formatNumber(target)}, 섭취 ${formatNumber(consumed)}`,
    };
  }
  // 넘었다 — 감량·유지·미설정이면 강조, 증량이면 목표를 채운 것이라 강조하지 않는다
  return {
    progress: 1,
    over: !gain,
    value: formatNumber(-remain),
    label: gain ? 'kcal 더 먹었어요' : 'kcal 넘었어요',
    a11y: `목표 ${formatNumber(target)}보다 ${formatNumber(-remain)}킬로칼로리 ${gain ? '더 먹었어요' : '넘었어요'}, 섭취 ${formatNumber(consumed)}`,
  };
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

export function DietScreen({ navigation, route }: Props) {
  const {
    today,
    history,
    loading,
    loadingMore,
    historyError,
    todayError,
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
  const [nutState, setNutState] = useState<LoadState>('loading');
  /** 링을 누르면 여는 계산식 시트 — 예전 카드 하단의 10px 수식 줄을 대신한다 */
  const [formulaModal, setFormulaModal] = useState(false);
  const [nutModal, setNutModal] = useState(false);
  const [tCal, setTCal] = useState('');
  const [tCarbs, setTCarbs] = useState('');
  const [tProtein, setTProtein] = useState('');
  const [tFat, setTFat] = useState('');
  const [savingNut, setSavingNut] = useState(false);
  /** 마법사로 계산했을 때 고른 방향 — 목표 저장에 함께 실린다. 직접 숫자만 고쳤으면 undefined(서버가 기존 값 유지) */
  const [tDirection, setTDirection] = useState<DietGoalType | undefined>(undefined);
  const [copyingYesterday, setCopyingYesterday] = useState(false);

  // 목표 칼로리 자동 계산(TDEE 마법사) — 계산만 하고, 확정 저장은 기존 목표 모달의 "저장"으로 한다
  const [wizardModal, setWizardModal] = useState(false);
  const [wizActivity, setWizActivity] = useState<ActivityLevel>('MODERATE');
  const [wizGoalType, setWizGoalType] = useState<DietGoalType>('MAINTAIN');
  const [wizRate, setWizRate] = useState(0.5);
  const [wizPreset, setWizPreset] = useState<MacroPreset>('BALANCED');
  const [calculating, setCalculating] = useState(false);
  /** 목표 모달이 뜨고 나서 마법사를 이어 연다 — 모달 둘을 한 번에 띄우면 iOS 가 뒤의 것을 버린다 */
  const wizardAfterNutRef = useRef(false);

  // 물 섭취 트래커
  const [water, setWater] = useState<WaterSummary | null>(null);
  const [waterState, setWaterState] = useState<LoadState>('loading');
  // 실패해도 이미 보이던 값은 지우지 않는다 — 새로고침 한 번 실패로 카드가 사라지면 안 된다
  const refreshWater = useCallback(() => {
    waterApi
      .today()
      .then((w) => {
        setWater(w);
        setWaterState('ok');
      })
      .catch(() => setWaterState((st) => (st === 'ok' ? 'ok' : 'error')));
  }, []);

  // 간헐적 단식 타이머
  const [fasting, setFasting] = useState<FastingStatus | null>(null);
  const [partnerFasting, setPartnerFasting] = useState<PartnerFasting | null>(null);
  const [fastingModal, setFastingModal] = useState(false);
  const [fastingBusy, setFastingBusy] = useState(false);
  const [customHours, setCustomHours] = useState('16');
  const [fastingState, setFastingState] = useState<LoadState>('loading');
  const refreshFasting = useCallback(() => {
    fastingApi
      .active()
      .then((f) => {
        setFasting(f);
        setFastingState('ok');
      })
      .catch(() => setFastingState((st) => (st === 'ok' ? 'ok' : 'error')));
    // 상대 진행 상태는 곁들이는 정보라 실패해도 줄을 비우기만 한다
    fastingApi.partner().then(setPartnerFasting).catch(() => setPartnerFasting(null));
  }, []);

  /*
   * 오늘 운동 기록 — 상단 체크인 카드가 "챙겼는지"를 이 값으로 가른다. 카드가 스스로
   * 부르지 않고 화면이 부른다: 운동 홈도 같은 카드를 쓰는데 양쪽이 다 조회하면 그 화면에서
   * 같은 요청이 두 번 나간다(WorkoutCheckinCard 주석).
   */
  const fetchWorkoutToday = useWorkoutStore((s) => s.fetchToday);
  const [goalState, setGoalState] = useState<LoadState>('loading');

  const refreshNutrition = useCallback(() => {
    dietApi
      .nutrition()
      .then((n) => {
        setNutrition(n);
        setNutState('ok');
      })
      .catch(() => setNutState((st) => (st === 'ok' ? 'ok' : 'error')));
  }, []);

  const refreshGoal = useCallback(() => {
    dietApi
      .coupleGoal()
      .then((g) => {
        setGoal(g);
        setGoalState('ok');
      })
      .catch(() => setGoalState((st) => (st === 'ok' ? 'ok' : 'error')));
  }, []);

  const refreshExtras = useCallback(() => {
    fetchWorkoutToday();
    streakApi.mealMe().then(setMyStreak).catch(() => setMyStreak(null));
    streakApi.mealCouple().then(setCoupleStreak).catch(() => setCoupleStreak(null));
    refreshGoal();
    refreshNutrition();
    refreshWater();
    refreshFasting();
  }, [refreshWater, refreshFasting, refreshGoal, refreshNutrition, fetchWorkoutToday]);

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
    setTDirection(undefined);
    setNutModal(true);
  };

  /** 마법사를 연다 — 저장해 둔 방향이 있으면 그 칩부터 선택해 둔다 */
  const openWizard = () => {
    if (nutrition?.goalDirection) setWizGoalType(nutrition.goalDirection);
    setWizardModal(true);
  };

  const openGoalWizard = () => {
    wizardAfterNutRef.current = true;
    openNutModal();
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
        goalDirection: tDirection,
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
      // 계산에 쓴 방향을 저장 버튼까지 들고 간다 — 예전엔 계산에만 쓰고 버려 앱이 감량 중인지 몰랐다
      setTDirection(wizGoalType);
      haptics.success();
      toast.success(res.usedBodyFat ? '체지방률까지 반영해 계산했어요. 확인 후 저장해주세요' : '계산했어요. 확인 후 저장해주세요');
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
  // 아래 셋은 useCallback — MealCard 가 memo 라 매 렌더 새 함수를 넘기면 memo 가 무의미해진다
  const onEdit = useCallback((m: Meal) => navigation.navigate('DietRecord', { meal: m }), [navigation]);

  // 카드의 장소 태그 — 럽슐랭 탭과 공유하는 화면이라 이 스택에 그대로 쌓인다(navigation/types.ts 참고)
  const onPlacePress = useCallback(
    (m: Meal) => {
      if (m.placeId && m.placeName) navigation.navigate('PlaceDetail', { placeId: m.placeId, name: m.placeName });
    },
    [navigation],
  );

  const onLongPress = useCallback((m: Meal) => {
    Alert.alert('식단 기록 삭제', `${m.mealTypeLabel} 기록을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        // useDeleteAction 이 in-flight 가드 + 기본 에러 토스트를 처리한다 (QA_CHECKLIST.md 패턴 7)
        // 지운 뒤 영양 합계·스트릭도 다시 읽는다 — 목록만 빠지고 "오늘 영양" 칼로리가 그대로 남았다
        onPress: () =>
          runDelete(m.id, async () => {
            await remove(m.id);
            refreshExtras();
          }, '식단 기록을 삭제하지 못했어요.'),
      },
    ]);
  }, [runDelete, remove, refreshExtras]);

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
          {/*
            몸 변화(체중 기록·그래프) — 입구가 운동 홈의 칩 하나뿐이었는데 운동 홈을 가린 뒤(2026-09-27)
            딥링크 외에 닿을 길이 없었다(LOVEBODY_REVIEW §3 A-13). 같은 HealthStack 화면이라 탭을 건너지
            않는다 — MY(HomeStack)에 두면 탭을 건너는 이동이 되고, iOS 에서 크로스탭 모달이 먹통이 된 전례가 있다.
          */}
          <Pressable
            onPress={() => navigation.navigate('BodyMetric')}
            hitSlop={8}
            style={({ pressed }) => [styles.topBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="몸 변화"
          >
            <MaterialCommunityIcons name="human" size={24} color={colors.textPrimary} />
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
          // 운동 홈은 2026-09-27 에 가렸다(config.ts WORKOUT_HOME_ENABLED) — prop 이 없으면 카드가 링크를 안 그린다
          onOpenWorkoutHome={WORKOUT_HOME_ENABLED ? () => navigation.navigate('WorkoutMain') : undefined}
          openDurationKey={route.params?.checkin}
          // 한 번 펼쳤으면 지운다 — 남겨 두면 화면이 다시 마운트될 때마다 또 펼쳐진다
          onDurationOpened={() => navigation.setParams({ checkin: undefined })}
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
            {/*
              순서(2026-10-02, LOVEBODY_REVIEW §3 A-1): 영양 요약 → <b>오늘 식사</b> → 물·단식 → 스트릭·커플 목표 →
              AI 알약. 예전엔 AI 알약·스트릭·영양·물/단식·커플 목표가 먼저라 첫 식사가 리스트 y≈720dp 에서
              시작했고, 어느 기기에서도 첫 화면에 식사가 한 장도 안 보였다. 이 탭은 "밥 사진 일기"로 쓰인다
              (DIET_USAGE_ANALYSIS §1) — 그 일기가 맨 아래 있었다.
            */}
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
                {(() => {
                  const ring = calorieRing(nutrition);
                  return (
                    <View style={styles.nutMain}>
                      {/*
                        주인공 = 남은 칼로리(목표 − 섭취). 예전엔 단백질 링이었다(2026-08-10, 운동 트래커 시절의 판단).
                        운동 소모는 링에 더하지 않고 아래 캡션으로 — §2-1 결정. 누르면 계산식 시트.
                      */}
                      <View style={styles.ringCol}>
                        <NutritionRing
                          progress={ring.progress}
                          over={ring.over}
                          value={ring.value}
                          label={ring.label}
                          accessibilityLabel={ring.a11y}
                          onPress={() => setFormulaModal(true)}
                        />
                        {nutrition.exerciseCalories > 0 ? (
                          <Text style={styles.exerciseCaption}>오늘 운동 −{formatNumber(nutrition.exerciseCalories)} kcal</Text>
                        ) : null}
                      </View>
                      <View style={styles.nutSecondary}>
                        {/* 단백질은 막대 첫 줄로 — 넘는 게 나쁜 일이 아니라 초과색을 쓰지 않는다 */}
                        <NutritionBar label="단백질" consumed={nutrition.consumedProtein} target={nutrition.targetProtein} unit="g" overIsBad={false} />
                        <NutritionBar label="탄수" consumed={nutrition.consumedCarbs} target={nutrition.targetCarbs} unit="g" />
                        <NutritionBar label="지방" consumed={nutrition.consumedFat} target={nutrition.targetFat} unit="g" />
                      </View>
                    </View>
                  );
                })()}
                {/*
                  목표가 없을 때가 사실상 기본 화면이다(앱에 "목표"는 이 숫자 칸뿐 — §2-1-1). 계산할 재료(신체 정보)가
                  있으면 계산을 권하고, 없으면 어디서 넣는지 한 줄로 말한다.
                */}
                {!nutrition.targetCalories && !nutrition.travelMode ? (
                  nutrition.bmr != null ? (
                    <TouchableOpacity onPress={openGoalWizard} style={styles.goalPrompt} accessibilityRole="button">
                      <Text style={styles.goalPromptText}>신체 정보로 하루 목표 칼로리를 계산해 드릴게요</Text>
                      <MaterialCommunityIcons name="chevron-right" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.energyHint}>MY › 신체 정보를 넣으면 목표 칼로리를 계산해 드려요.</Text>
                  )
                ) : null}

                {/* 당류/나트륨/식이섬유 — 목표 없이 오늘 합계만 참고하는 정보성 지표라 게이지 없이 한 줄 */}
                {nutrition.consumedSugar > 0 || nutrition.consumedSodium > 0 || nutrition.consumedFiber > 0 ? (
                  <Text style={styles.extraNutrients}>
                    당류 {formatNumber(nutrition.consumedSugar)}g · 나트륨 {formatNumber(nutrition.consumedSodium)}mg
                    {' '}· 식이섬유 {formatNumber(nutrition.consumedFiber)}g
                  </Text>
                ) : null}
              </View>
            ) : nutState === 'error' ? (
              <LoadErrorRow what="오늘 영양" onRetry={refreshNutrition} />
            ) : (
              <CardSkeleton height={200} />
            )}

            {/* 오늘 — 영양 카드 바로 아래. 비어 있어도 섹션은 그린다(빈 상태가 화면 밖으로 밀려나지 않게) */}
            <View style={styles.todayHeader}>
              <Text style={styles.sectionTitle}>오늘</Text>
              <View style={styles.todayHeaderRight}>
                {todayCalories > 0 ? <Text style={styles.todayCal}>총 {formatKcal(todayCalories)}</Text> : null}
                {history.length > 0 ? (
                  <TouchableOpacity onPress={onCopyYesterday} disabled={copyingYesterday} hitSlop={8} accessibilityRole="button">
                    <Text style={styles.copyYesterday}>{copyingYesterday ? '불러오는 중…' : '어제 식단 불러오기'}</Text>
                  </TouchableOpacity>
                ) : null}
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
            ) : todayError ? (
              <LoadErrorRow what="오늘 식단" onRetry={fetchToday} />
            ) : (
              <View style={styles.emptyToday}>
                <Text style={styles.emptyText}>
                  {history.length === 0 && !loading && !historyError
                    ? '아직 식단 기록이 없어요 — 아래 버튼으로 첫 끼를 남겨 보세요'
                    : '오늘 식단 기록이 아직 없어요'}
                </Text>
              </View>
            )}

            {/* 물 + 간헐적 단식 — 한 카드 안의 한 줄 타일 둘(§6-3, 9/23) */}
            {waterState === 'loading' && fastingState === 'loading' ? (
              <CardSkeleton height={105} />
            ) : (
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
                ) : waterState === 'error' ? (
                  <LoadErrorRow what="물" onRetry={refreshWater} />
                ) : null}

                <View style={styles.trackerDivider} />

                {/* 간헐적 단식 — 세션이 서버에 살아있어 커플 상대방 진행 상태도 함께 보여준다 */}
                {fasting?.active ? (
                  <FastingActiveRow fasting={fasting} partnerFasting={partnerFasting} onEnd={onEndFasting} />
                ) : fastingState === 'error' ? (
                  <LoadErrorRow what="간헐적 단식" onRetry={refreshFasting} />
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
            )}

            {/*
              이번 주 — 스트릭 줄과 커플 목표 카드를 <b>주간 스트립 한 줄 + 목표 캡션</b>으로 합쳤다(LOVEBODY_REVIEW §2-3).
              "이번 주 함께 3/5일"은 스트립이 그림으로 보여주는 것의 숫자판이라 따로 카드일 이유가 없었다.
              미연결이면 내 점만, 목표 캡션은 숨긴다. 구서버(날짜 목록 없음)면 스트립 없이 숫자만.
            */}
            {goal ? (
              <View style={styles.weekCard}>
                <View style={styles.weekHead}>
                  <Text style={styles.weekTitle}>이번 주</Text>
                  <Text style={styles.streakText}>
                    연속 {myStreak?.currentCount ?? 0}일
                    {goal.connected ? ` · 함께 ${coupleStreak?.currentCount ?? 0}일` : ''}
                  </Text>
                  <Text style={styles.streakMax}>최고 {myStreak?.maxCount ?? 0}일</Text>
                </View>
                {goal.myDates ? (
                  <WeekStrip
                    myDates={goal.myDates}
                    partnerDates={goal.partnerDates}
                    showPartner={goal.connected}
                    what="식단"
                  />
                ) : null}
                {goal.connected ? (
                  <Pressable
                    style={({ pressed }) => [styles.goalCaption, pressed && styles.trackerRowPressed]}
                    onPress={() => setGoalModal(true)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      goal.goalDays
                        ? `이번 주 함께 ${goal.bothDays}/${goal.goalDays}일${goal.achieved ? ', 달성' : ''}. 목표 바꾸기`
                        : '커플 식단 목표 설정'
                    }
                  >
                    <Text style={styles.goalCaptionText}>
                      {goal.goalDays ? `이번 주 함께 ${goal.bothDays}/${goal.goalDays}일` : '커플 식단 목표 · 설정'}
                    </Text>
                    {goal.achieved ? <Text style={styles.goalBadge}>달성!</Text> : null}
                    <MaterialCommunityIcons name="chevron-right" size={16} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ) : goalState === 'error' ? (
              <LoadErrorRow what="이번 주 기록" onRetry={refreshGoal} />
            ) : (
              <CardSkeleton height={112} />
            )}

            {/* AI 인사이트 — 주간 식단 코칭 / 커플 주간 레터. 매일 보는 것이 아니라 맨 아래로 */}
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

            {history.length > 0 ? <Text style={[styles.sectionTitle, styles.historyTitle]}>히스토리</Text> : null}
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
          // 비어 있음은 위 "오늘" 섹션이 말한다 — 여기서는 로드 실패만 구분해 재시도를 준다 (QA_CHECKLIST.md 패턴 1)
          !loading && historyError ? (
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

      {/*
        계산식 시트 — 링을 누르면. 예전엔 카드 하단에 10px 수식("기초대사량 + 운동 − 섭취")과 두 번째 "남은 칼로리"가
        상주해, 기준이 다른 숫자 둘이 한 카드에 있었다(§2-1 반박 4). 링 하나만 남기고 나머지는 여기서 "참고"로.
      */}
      <Modal visible={formulaModal} transparent animationType="fade" onRequestClose={() => setFormulaModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFormulaModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>오늘 칼로리 계산</Text>
            {nutrition ? (
              <View style={styles.formulaList}>
                <FormulaRow label="목표" value={nutrition.targetCalories ? formatKcal(nutrition.targetCalories) : '없음'} />
                <FormulaRow label="섭취" value={formatKcal(nutrition.consumedCalories)} />
                {nutrition.targetCalories ? (
                  <FormulaRow
                    label="목표 − 섭취"
                    value={formatKcal(nutrition.targetCalories - nutrition.consumedCalories)}
                    strong
                  />
                ) : null}
                <View style={styles.trackerDivider} />
                <Text style={styles.formulaNote}>참고 — 오늘 쓴 칼로리 기준</Text>
                <FormulaRow label="기초대사량" value={nutrition.bmr != null ? formatKcal(nutrition.bmr) : '신체 정보 필요'} />
                <FormulaRow label="운동 소모(추정)" value={formatKcal(nutrition.exerciseCalories)} />
                {nutrition.energyBalance != null ? (
                  <FormulaRow label="기초대사량 + 운동 − 섭취" value={formatKcal(nutrition.energyBalance)} />
                ) : null}
                <Text style={styles.formulaNote}>
                  운동 소모는 운동 시간으로 어림한 값이라 링의 남은 칼로리에는 더하지 않아요.
                </Text>
              </View>
            ) : null}
            <Button title="닫기" variant="secondary" size="md" onPress={() => setFormulaModal(false)} />
          </Pressable>
        </Pressable>
      </Modal>

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
      <Modal
        visible={nutModal}
        transparent
        animationType="fade"
        onRequestClose={closeNutModal}
        onShow={() => {
          if (!wizardAfterNutRef.current) return;
          wizardAfterNutRef.current = false;
          openWizard();
        }}
      >
        <Pressable style={styles.modalBackdrop} onPress={closeNutModal}>
          <KeyboardAvoidingView style={styles.modalAvoid} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.nutModalHeader}>
              <Text style={styles.modalTitle}>하루 영양 목표</Text>
              <TouchableOpacity onPress={openWizard}>
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
  nutSecondary: { flex: 1, minWidth: 0, gap: spacing.sm },
  travelModeBadge: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.xs },
  nutRow: { gap: 3 },
  // 큰 글자에서 라벨·값이 한 줄에 안 들어가면 값이 다음 줄로 내려간다(고정 폭 없음 — §3 A-10)
  nutRowHead: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: spacing.sm },
  nutLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  nutTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  // 내 지표 — 소유자 의미가 없으므로 크롬 채움. 예전 accent(=함께)는 뜻이 없었다
  nutFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryFill },
  nutFillOver: { backgroundColor: colors.primary },
  nutVal: { marginLeft: 'auto', textAlign: 'right', fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  ringCol: { alignItems: 'center', gap: spacing.xs },
  exerciseCaption: { fontSize: fontSize.micro, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  extraNutrients: { fontSize: fontSize.micro, color: colors.textTertiary, fontWeight: '600', marginTop: spacing.xs },
  formulaList: { gap: spacing.xs },
  formulaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  formulaLabel: { flexShrink: 1, fontSize: fontSize.body, color: colors.textSecondary },
  formulaValue: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '700' },
  formulaStrong: { color: colors.textPrimary, fontWeight: '800' },
  formulaNote: { fontSize: fontSize.caption, color: colors.textTertiary, lineHeight: 18 },
  skeleton: { borderRadius: radius.lg, backgroundColor: colors.surfaceAlt, marginBottom: spacing.md },
  loadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  loadErrorText: { flex: 1, fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  goalPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  goalPromptText: { flex: 1, fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  energyHint: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.xs },
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
  aiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  aiBtn: { flex: 1 },
  aiHeadline: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary, lineHeight: 22 },
  aiScore: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },
  aiTip: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 21 },
  aiLetter: { fontSize: fontSize.body, color: colors.textPrimary, lineHeight: 24 },
  list: { padding: spacing.lg, paddingBottom: layout.listBottomWithFab },
  streakText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  streakMax: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: 'auto' },
  // 이번 주 — 스트릭 + 주간 스트립 + 커플 목표 캡션. 커플 목표의 함께 색은 캡션 글자에 남긴다
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  weekHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: spacing.sm },
  weekTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  goalCaption: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36 },
  goalCaptionText: { flex: 1, fontSize: fontSize.caption, fontWeight: '800', color: colors.togetherText },
  goalBadge: { fontSize: fontSize.caption, fontWeight: '800', color: colors.success },
  todayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  todayHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // 내 오늘 합계 — 소유자·함께 의미가 없으므로 본문색. 예전 togetherText 는 뜻이 없었다(§3 A-9)
  todayCal: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '800' },
  copyYesterday: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary },
  historyTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
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
