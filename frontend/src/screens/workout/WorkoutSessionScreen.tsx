/** 운동 세션 보조 (Jefit/Strong 스타일) — 세트별 무게·횟수 입력 + 완료 체크 + 휴식 타이머.
 *  종료하면 완료한 세트가 운동 기록으로 저장된다. 루틴으로 실행 시 exercises 파라미터로 시작.
 *  입력 동선 최소화: 종목의 직전 수행 기록(무게·횟수)을 자동으로 불러와 기본 입력값으로 채워두므로,
 *  실제 운동 시에는 값이 다르지 않은 한 '완료' 버튼만 누르면 된다. */
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DraggableFlatList, { type RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type {
  SessionExerciseAlternativeParam,
  SessionExerciseParam,
  WorkoutStackParamList,
} from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useWorkoutStore } from '../../store/workoutStore';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { ExerciseCatalogItem, ExerciseLastPerformance } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSession'>;

const CATEGORIES = ['근력', '유산소', '유연성'];
const REST_PRESETS = [60, 90, 120];
// 종목 카탈로그 시드 데이터와 맞춘 자극 부위 목록 — 대체 종목 탐색용
const MUSCLE_GROUPS = ['가슴', '등', '어깨', '하체', '팔', '코어', '전신'];

interface SessionSet {
  weightKg: string;
  reps: string;
  done: boolean;
}
interface SessionExercise {
  key: string;
  name: string;
  category: string;
  reps?: number;
  weightKg?: number;
  // 대체 종목 추천의 기준 — 루틴에서 시작했거나 이미 한 번 대체한 경우에만 채워짐
  muscleGroup?: string;
  equipment?: string;
  exerciseCatalogId?: number;
  // 이 종목만의 휴식 시간(초) — 없으면 세션 전역 기본값 사용(③)
  restSeconds?: number;
  // 루틴 작성 시 사전 지정해둔 대체 종목(④) — 세션 중 교체 시 먼저 추천된다
  alternatives?: SessionExerciseAlternativeParam[];
  sets: SessionSet[];
}

let keySeq = 0;
const nextKey = () => `ex-${keySeq++}`;

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 문자열 입력값 → 숫자. 빈 값/숫자가 아니면 undefined */
function toNum(s: string): number | undefined {
  const trimmed = s.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isNaN(n) ? undefined : n;
}

function buildSet(weightKg?: number | null, reps?: number | null): SessionSet {
  return {
    weightKg: weightKg != null ? String(weightKg) : '',
    reps: reps != null ? String(reps) : '',
    done: false,
  };
}

/** 종목의 직전 수행 기록으로 세트 배열을 채운다 — 세트별 실제 기록(entries)이 있으면 그 값을,
 *  없으면 직전 종목 평균값을 기본값으로 쓴다. 이미 체크된 세트는 건드리지 않는다. */
function applyPrefill(sets: SessionSet[], perf: ExerciseLastPerformance): SessionSet[] {
  return sets.map((s, i) => {
    if (s.done) return s;
    const entry = perf.entries[i];
    const weightKg = entry?.weightKg ?? perf.weightKg;
    const reps = entry?.reps ?? perf.reps;
    return {
      ...s,
      weightKg: weightKg != null ? String(weightKg) : s.weightKg,
      reps: reps != null ? String(reps) : s.reps,
    };
  });
}

/**
 * 세션 시작 시점의 루틴 구성과 지금 화면의 구성이 다른지 — 스마트 루틴 동기화(①)의 트리거.
 * 종목 자체가 바뀌었거나(대체/추가/삭제) 세트 수가 달라졌을 때만 true. 무게·횟수 값 차이는
 * 매 세션 자연스레 달라지는 수행 기록이라 여기서는 비교하지 않는다(루틴 "구성"만 본다).
 */
function hasCompositionChanged(original: SessionExerciseParam[], current: SessionExercise[]): boolean {
  if (original.length !== current.length) return true;
  return original.some((o, i) => {
    const c = current[i];
    if (!c || o.name !== c.name) return true;
    const originalSetCount = Math.max(1, o.targetSets ?? 3);
    return originalSetCount !== c.sets.length;
  });
}

/** ② 자유 세션을 새 루틴으로 저장할 때의 기본 이름 제안 — 피드 카드("스쿼트 외 1개")와 같은 문구 */
function suggestRoutineTitle(exercises: SessionExercise[]): string {
  if (exercises.length === 0) return '';
  if (exercises.length === 1) return exercises[0].name;
  return `${exercises[0].name} 외 ${exercises.length - 1}개`;
}

export function WorkoutSessionScreen({ navigation, route }: Props) {
  const save = useWorkoutStore((s) => s.save);

  const [exercises, setExercises] = useState<SessionExercise[]>(() =>
    (route.params?.exercises ?? []).map((e) => ({
      key: nextKey(),
      name: e.name,
      category: e.category ?? '근력',
      reps: e.reps ?? undefined,
      weightKg: e.weightKg ?? undefined,
      muscleGroup: e.muscleGroup ?? undefined,
      equipment: e.equipment ?? undefined,
      exerciseCatalogId: e.exerciseCatalogId ?? undefined,
      restSeconds: e.restSeconds ?? undefined,
      alternatives: e.alternatives,
      sets: Array.from({ length: Math.max(1, e.targetSets ?? 3) }, () => buildSet(e.weightKg, e.reps)),
    })),
  );

  const [restSeconds, setRestSeconds] = useState(90);
  const [rest, setRest] = useState(0); // 남은 휴식 초
  const [saving, setSaving] = useState(false);

  // 운동 추가 모달
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('근력');
  const [fSets, setFSets] = useState('3');
  const [fReps, setFReps] = useState('10');
  const [fWeight, setFWeight] = useState('');
  const [adding, setAdding] = useState(false);

  // ② 역방향 루틴 저장 — 루틴 없이 시작한 자유 세션을 종료할 때 "새 루틴으로 저장?" 제안
  const [saveRoutinePromptOpen, setSaveRoutinePromptOpen] = useState(false);
  const [saveRoutineTitle, setSaveRoutineTitle] = useState('');
  const [savingRoutine, setSavingRoutine] = useState(false);

  // 대체 종목 바텀시트 — 같은 자극 부위 운동으로 1탭 교체
  const [substituteFor, setSubstituteFor] = useState<SessionExercise | null>(null);
  const [substituteGroup, setSubstituteGroup] = useState(MUSCLE_GROUPS[0]);
  const [substituteCandidates, setSubstituteCandidates] = useState<ExerciseCatalogItem[]>([]);
  const [substituteLoading, setSubstituteLoading] = useState(false);

  const openSubstitute = (e: SessionExercise) => {
    haptics.light();
    setSubstituteFor(e);
    setSubstituteGroup(e.muscleGroup ?? MUSCLE_GROUPS[0]);
  };

  useEffect(() => {
    if (!substituteFor) return;
    setSubstituteLoading(true);
    workoutApi
      .exerciseCatalog(substituteGroup)
      .then((list) => setSubstituteCandidates(list.filter((c) => c.name !== substituteFor.name)))
      .catch(() => setSubstituteCandidates([]))
      .finally(() => setSubstituteLoading(false));
  }, [substituteFor, substituteGroup]);

  /** 대체 종목 적용(공통) — 세트 구성(무게·횟수·완료 여부)은 그대로 두고 종목 정보만 바꾼다(데이터 손실 없음). */
  const applySubstituteCandidate = async (candidate: {
    name: string;
    category?: string | null;
    muscleGroup: string;
    equipment?: string | null;
    exerciseCatalogId: number;
  }) => {
    const targetKey = substituteFor?.key;
    if (!targetKey) return;
    setExercises((prev) =>
      prev.map((x) =>
        x.key === targetKey
          ? {
              ...x,
              name: candidate.name,
              category: candidate.category ?? x.category,
              muscleGroup: candidate.muscleGroup,
              equipment: candidate.equipment ?? undefined,
              exerciseCatalogId: candidate.exerciseCatalogId,
            }
          : x,
      ),
    );
    setSubstituteFor(null);
    haptics.success();
    toast.success(`${candidate.name}(으)로 교체했어요`);
    // 새 종목의 직전 기록이 있으면 아직 체크 안 한 세트만 이어서 프리필한다.
    try {
      const found = await workoutApi.lastPerformance([candidate.name]);
      if (found[0]) {
        setExercises((prev) =>
          prev.map((x) => (x.key === targetKey ? { ...x, sets: applyPrefill(x.sets, found[0]) } : x)),
        );
      }
    } catch {
      // 프리필 실패는 무시 — 이미 종목 교체는 완료된 상태
    }
  };

  /** 자극 부위 탐색에서 고른 종목 교체 */
  const applySubstitute = (candidate: ExerciseCatalogItem) =>
    applySubstituteCandidate({
      name: candidate.name,
      category: candidate.category,
      muscleGroup: candidate.muscleGroup,
      equipment: candidate.equipment,
      exerciseCatalogId: candidate.id,
    });

  /** 루틴 작성 시 미리 지정해둔 대체 종목(④) 교체 — 탐색 없이 바로 적용 */
  const applyPresetAlternative = (alt: SessionExerciseAlternativeParam) =>
    applySubstituteCandidate({
      name: alt.name,
      category: alt.category,
      muscleGroup: alt.muscleGroup,
      equipment: alt.equipment,
      exerciseCatalogId: alt.exerciseCatalogId,
    });

  // 세션 시작 시 루틴/파라미터로 받은 종목들의 직전 기록을 한 번에 불러와 프리필한다.
  useEffect(() => {
    const names = Array.from(new Set((route.params?.exercises ?? []).map((e) => e.name)));
    if (names.length === 0) return;
    workoutApi
      .lastPerformance(names)
      .then((list) => {
        if (list.length === 0) return;
        const byName = new Map(list.map((p) => [p.exerciseName, p]));
        setExercises((prev) =>
          prev.map((e) => {
            const perf = byName.get(e.name);
            return perf ? { ...e, sets: applyPrefill(e.sets, perf) } : e;
          }),
        );
      })
      .catch(() => {
        // 프리필은 편의 기능이라 실패해도 조용히 넘어간다 — 직접 입력하면 된다.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 휴식 타이머 — rest>0 이면 1초씩 감소
  const restRef = useRef(rest);
  restRef.current = rest;
  useEffect(() => {
    if (rest <= 0) return;
    const id = setInterval(() => {
      const next = restRef.current - 1;
      if (next <= 0) {
        haptics.success();
        setRest(0);
      } else {
        setRest(next);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [rest > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);

  const toggleSet = (exKey: string, idx: number) => {
    haptics.light();
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const sets = e.sets.map((s, i) => (i === idx ? { ...s, done: !s.done } : s));
        // 방금 '완료'로 바꿨으면 휴식 타이머 시작 — 종목별 휴식 시간이 있으면 그걸, 없으면 전역 기본값(③)
        if (!e.sets[idx].done) setRest(e.restSeconds ?? restSeconds);
        return { ...e, sets };
      }),
    );
  };

  const updateSetField = (exKey: string, idx: number, field: 'weightKg' | 'reps', value: string) =>
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const sets = e.sets.map((s, i) => (i === idx && !s.done ? { ...s, [field]: value } : s));
        return { ...e, sets };
      }),
    );

  const addSetRow = (exKey: string) =>
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        // 새 세트는 직전 세트 값을 기본으로 이어받는다 — 매번 다시 입력할 필요 없게.
        const last = e.sets[e.sets.length - 1];
        return { ...e, sets: [...e.sets, { weightKg: last?.weightKg ?? '', reps: last?.reps ?? '', done: false }] };
      }),
    );

  const removeExercise = (exKey: string) =>
    setExercises((prev) => prev.filter((e) => e.key !== exKey));

  const onAddExercise = async () => {
    if (!fName.trim()) {
      toast.error('운동 이름을 입력해주세요.');
      return;
    }
    const name = fName.trim();
    const setCount = Math.max(1, Math.min(20, Number(fSets) || 3));
    const targetReps = fReps ? Number(fReps) : undefined;
    const targetWeight = fWeight ? Number(fWeight) : undefined;

    setAdding(true);
    let sets = Array.from({ length: setCount }, () => buildSet(targetWeight, targetReps));
    try {
      const found = await workoutApi.lastPerformance([name]);
      if (found[0]) sets = applyPrefill(sets, found[0]);
    } catch {
      // 프리필 실패 시 방금 입력한 목표값만으로 진행
    }
    setExercises((prev) => [
      ...prev,
      { key: nextKey(), name, category: fCategory, reps: targetReps, weightKg: targetWeight, sets },
    ]);
    setFName('');
    setFWeight('');
    setAdding(false);
    setAddOpen(false);
  };

  const onFinish = async () => {
    const payloadSets = exercises
      .map((e, i) => {
        const doneList = e.sets.filter((s) => s.done);
        if (doneList.length === 0) return null;
        const last = doneList[doneList.length - 1];
        const repsVal = toNum(last.reps) ?? e.reps ?? null;
        const weightVal = toNum(last.weightKg) ?? e.weightKg ?? null;
        return {
          exerciseName: e.name,
          category: e.category,
          sets: doneList.length,
          reps: repsVal,
          weightKg: weightVal != null ? String(weightVal) : null,
          orderNo: i + 1,
          exerciseCatalogId: e.exerciseCatalogId ?? null,
          muscleGroup: e.muscleGroup ?? null,
          equipment: e.equipment ?? null,
          // 세트별 실제 입력값 — 프리필 그대로면 지난 기록과 같은 값, 수정했으면 그 값이 그대로 남는다.
          entries: e.sets.map((s, idx) => {
            const w = toNum(s.weightKg);
            return {
              setNo: idx + 1,
              weightKg: w != null ? String(w) : null,
              reps: toNum(s.reps) ?? null,
              completed: s.done,
            };
          }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (payloadSets.length === 0) {
      toast.error('완료한 세트가 없어요. 세트를 체크해주세요!');
      return;
    }

    const routineId = route.params?.routineId;
    const composeChanged =
      routineId != null && hasCompositionChanged(route.params?.exercises ?? [], exercises);

    setSaving(true);
    try {
      await save({
        workoutDate: toDateString(),
        sourceRoutineId: routineId,
        sets: payloadSets as never,
      });
      haptics.success();
      toast.success('운동 완료! 기록했어요 ');
      // 이미 저장이 끝났으므로 이후의 모든 이탈(goBack)은 이탈 가드 확인 없이 통과시킨다
      allowLeave();
      if (routineId != null) {
        // 루틴에서 시작한 세션 — 구성이 바뀌었으면 템플릿에도 반영할지 물어본다(스마트 동기화)
        if (composeChanged) {
          promptRoutineSync(routineId, route.params?.routineTitle ?? '내 루틴');
        } else {
          navigation.goBack();
        }
      } else {
        // ② 역방향 루틴 저장 — 자유 세션이면 다음에 원탭으로 시작할 수 있게 루틴화를 제안한다
        setSaveRoutineTitle(suggestRoutineTitle(exercises));
        setSaveRoutinePromptOpen(true);
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /*
   * 이탈 가드 — 예전엔 하단 "종료" 버튼에만 확인이 걸려 있어서
   * 헤더 뒤로가기·하드웨어 백·스와이프백으로 나가면 체크한 세트가 통째로 사라졌다.
   * usePreventRemove 기반 훅은 모든 이탈 경로를 가로챈다(goBack() 직접 호출도 포함).
   */
  const allowLeave = useDirtyGuard(doneSets > 0, {
    title: '세션 종료',
    message: '기록하지 않고 나갈까요?',
    stayText: '계속하기',
    leaveText: '나가기',
  });

  // 운동 추가 모달 닫기 — 입력이 있으면 확인 후 닫는다 (백드롭·Android 백 공용).
  // "사라져요"라고 안내했으므로 닫을 때 실제로 비운다 (남기면 다음에 또 확인이 뜬다)
  const closeAddModal = () =>
    confirmDiscard(fName.trim().length > 0 || fWeight.trim().length > 0, () => {
      setAddOpen(false);
      setFName('');
      setFWeight('');
    });

  /** ② 방금 마친 자유 세션을 새 루틴 템플릿으로 저장 — 건너뛰어도 기록은 이미 저장된 상태. */
  const onSaveAsRoutine = async () => {
    if (!saveRoutineTitle.trim()) {
      toast.error('루틴 이름을 입력해주세요.');
      return;
    }
    setSavingRoutine(true);
    try {
      await workoutApi.saveRoutine({
        title: saveRoutineTitle.trim(),
        exercises: exercises.map((e) => ({
          exerciseName: e.name,
          category: e.category,
          targetSets: e.sets.length,
          reps: e.reps,
          weightKg: e.weightKg,
          exerciseCatalogId: e.exerciseCatalogId,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          restSeconds: e.restSeconds,
          alternativeExerciseCatalogIds: e.alternatives?.map((a) => a.exerciseCatalogId),
        })),
      });
      haptics.success();
      toast.success('새 루틴으로 저장했어요!');
    } catch (err) {
      toast.error(getErrorMessage(err, '루틴 저장에 실패했어요.'));
    } finally {
      setSavingRoutine(false);
      setSaveRoutinePromptOpen(false);
      navigation.goBack();
    }
  };

  const skipSaveAsRoutine = () => {
    setSaveRoutinePromptOpen(false);
    navigation.goBack();
  };

  /** 오늘 바뀐 구성(대체 종목·세트 추가/삭제)을 루틴 템플릿에도 반영할지 물어본다 —
   *  일회성 변경(이번만 적용)과 템플릿 업데이트(루틴에도 반영)를 한 번의 선택으로 나눈다. */
  const promptRoutineSync = (routineId: number, title: string) => {
    Alert.alert('루틴 구성이 바뀌었어요', '오늘 변경된 구성을 기존 루틴 템플릿에도 반영할까요?', [
      { text: '이번만 적용', style: 'cancel', onPress: () => navigation.goBack() },
      {
        text: '루틴에도 반영',
        onPress: async () => {
          try {
            await workoutApi.updateRoutine(routineId, {
              title,
              exercises: exercises.map((e) => ({
                exerciseName: e.name,
                category: e.category,
                targetSets: e.sets.length,
                reps: e.reps,
                weightKg: e.weightKg,
                exerciseCatalogId: e.exerciseCatalogId,
                muscleGroup: e.muscleGroup,
                equipment: e.equipment,
                restSeconds: e.restSeconds,
                alternativeExerciseCatalogIds: e.alternatives?.map((a) => a.exerciseCatalogId),
              })),
            });
            toast.success('루틴에도 반영했어요!');
          } catch (err) {
            toast.error(getErrorMessage(err, '루틴 반영에 실패했어요.'));
          } finally {
            navigation.goBack();
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* 진행 헤더 */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          세트 {doneSets}/{totalSets}
        </Text>
        <View style={styles.restPresets}>
          <Text style={styles.restLabel}>휴식</Text>
          {REST_PRESETS.map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.restChip, restSeconds === r && styles.restChipActive]}
              onPress={() => setRestSeconds(r)}
            >
              <Text style={[styles.restChipText, restSeconds === r && styles.restChipTextActive]}>{r}s</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <DraggableFlatList
        data={exercises}
        keyExtractor={(e) => e.key}
        onDragEnd={({ data }) => setExercises(data)}
        contentContainerStyle={styles.list}
        renderItem={({ item: e, drag, isActive }: RenderItemParams<SessionExercise>) => {
          const done = e.sets.filter((s) => s.done).length;
          return (
            <ScaleDecorator>
              <View style={[styles.exCard, isActive && styles.exCardActive]}>
                <View style={styles.exHeader}>
                  <Pressable onLongPress={drag} disabled={isActive} hitSlop={8} style={styles.dragHandle}>
                    <Text style={styles.dragHandleText}>⠿</Text>
                  </Pressable>
                  <Text style={styles.exName}>{e.name}</Text>
                  <View style={styles.exHeaderActions}>
                    <TouchableOpacity onPress={() => openSubstitute(e)} hitSlop={8}>
                      <Text style={styles.exSwap}>⇄</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeExercise(e.key)} hitSlop={8}>
                      <Text style={styles.exRemove}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.exMeta}>
                  {e.category}
                  {e.muscleGroup ? ` · ${e.muscleGroup}` : ''} · {done}/{e.sets.length} 세트
                </Text>

                <View style={styles.setColHeader}>
                  <Text style={styles.setColHeaderIndex} />
                  <Text style={styles.setColHeaderText}>무게(kg)</Text>
                  <Text style={styles.setColHeaderX} />
                  <Text style={styles.setColHeaderText}>횟수</Text>
                  <Text style={styles.setColHeaderCheck} />
                </View>
                <View style={styles.setRows}>
                  {e.sets.map((s, i) => (
                    <View key={i} style={styles.setRow}>
                      <Text style={styles.setRowIndex}>{i + 1}</Text>
                      <TextInput
                        style={[styles.setInput, s.done && styles.setInputDone]}
                        value={s.weightKg}
                        onChangeText={(v) => updateSetField(e.key, i, 'weightKg', v)}
                        keyboardType="decimal-pad"
                        placeholder="kg"
                        placeholderTextColor={colors.textTertiary}
                        editable={!s.done}
                      />
                      <Text style={styles.setRowX}>×</Text>
                      <TextInput
                        style={[styles.setInput, s.done && styles.setInputDone]}
                        value={s.reps}
                        onChangeText={(v) => updateSetField(e.key, i, 'reps', v)}
                        keyboardType="number-pad"
                        placeholder="회"
                        placeholderTextColor={colors.textTertiary}
                        editable={!s.done}
                      />
                      <TouchableOpacity
                        style={[styles.setCheck, s.done && styles.setCheckDone]}
                        onPress={() => toggleSet(e.key, i)}
                      >
                        <Text style={[styles.setCheckText, s.done && styles.setCheckTextDone]}>
                          {s.done ? '✓' : ''}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.setAddRow} onPress={() => addSetRow(e.key)}>
                    <Text style={styles.setAddText}>＋ 세트 추가</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScaleDecorator>
          );
        }}
        ListFooterComponent={
          <>
            <TouchableOpacity style={styles.addExercise} onPress={() => setAddOpen(true)}>
              <Text style={styles.addExerciseText}>＋ 운동 추가</Text>
            </TouchableOpacity>

            {exercises.length === 0 ? (
              <Text style={styles.emptyHint}>운동을 추가하면 직전 기록으로 무게·횟수가 채워져요.{'\n'}세트를 체크만 하면 자동으로 휴식 타이머가 돌아가요.</Text>
            ) : (
              <Text style={styles.reorderHint}>⠿ 을 길게 눌러 운동 순서를 바꿀 수 있어요.</Text>
            )}
          </>
        }
      />

      {/* 하단 액션 — 휴식 타이머는 이 영역 위에 오버레이로 뜬다 (레이아웃을 밀지 않음) */}
      <View style={styles.bottomArea}>
        {rest > 0 ? (
          <View style={styles.timerOverlay}>
            <Text style={styles.timerText}>휴식 {mmss(rest)}</Text>
            <View style={styles.timerBtns}>
              <TouchableOpacity style={styles.timerBtn} onPress={() => setRest((r) => Math.max(0, r - 15))}>
                <Text style={styles.timerBtnText}>-15</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.timerBtn} onPress={() => setRest((r) => r + 15)}>
                <Text style={styles.timerBtnText}>+15</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.timerBtn, styles.timerSkip]} onPress={() => setRest(0)}>
                <Text style={styles.timerSkipText}>건너뛰기</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* 하단 액션 — 세트를 체크했으면 useDirtyGuard 가 확인 다이얼로그를 띄운다 */}
        <View style={styles.footer}>
          <Button title="종료" variant="ghost" size="md" onPress={() => navigation.goBack()} style={styles.flex} />
          <Button title="운동 완료" size="md" onPress={onFinish} loading={saving} style={styles.flex} />
        </View>
      </View>

      {/* 운동 추가 모달 */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.backdrop} onPress={closeAddModal}>
          {/* 키보드가 모달 하단 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.modalTitle}>운동 추가</Text>
              <TextField label="운동 이름" placeholder="예: 벤치프레스" value={fName} onChangeText={setFName} />
              <Text style={styles.modalLabel}>부위</Text>
              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, fCategory === c && styles.catChipActive]}
                    onPress={() => setFCategory(c)}
                  >
                    <Text style={[styles.catText, fCategory === c && styles.catTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formRow}>
                <View style={styles.flex}>
                  <TextField label="세트" value={fSets} onChangeText={setFSets} keyboardType="number-pad" />
                </View>
                <View style={styles.flex}>
                  <TextField label="횟수" value={fReps} onChangeText={setFReps} keyboardType="number-pad" />
                </View>
                <View style={styles.flex}>
                  <TextField label="무게(kg)" value={fWeight} onChangeText={setFWeight} keyboardType="decimal-pad" />
                </View>
              </View>
              <Button title="추가" onPress={onAddExercise} loading={adding} style={styles.modalBtn} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 대체 종목 선택 — 동일 자극 부위 운동으로 1탭 교체 */}
      <Modal
        visible={!!substituteFor}
        transparent
        animationType="fade"
        onRequestClose={() => setSubstituteFor(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSubstituteFor(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>대체 종목 선택</Text>
            <Text style={styles.modalLabel}>
              {substituteFor?.name} 대신 같은 자극 부위 운동으로 바꿔요 · 세트 기록은 그대로 유지돼요
            </Text>
            {substituteFor?.alternatives && substituteFor.alternatives.length > 0 ? (
              <>
                <Text style={styles.modalLabel}>⭐ 추천 대체 종목</Text>
                <View style={styles.groupRow}>
                  {substituteFor.alternatives.map((a) => (
                    <TouchableOpacity
                      key={a.exerciseCatalogId}
                      style={styles.presetChip}
                      onPress={() => applyPresetAlternative(a)}
                    >
                      <Text style={styles.presetChipText}>{a.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.modalLabel}>다른 종목 찾기</Text>
              </>
            ) : null}
            <View style={styles.groupRow}>
              {MUSCLE_GROUPS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.groupChip, substituteGroup === g && styles.groupChipActive]}
                  onPress={() => setSubstituteGroup(g)}
                >
                  <Text style={[styles.groupText, substituteGroup === g && styles.groupTextActive]}>{g}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {substituteLoading ? (
              <Text style={styles.emptyHint}>불러오는 중…</Text>
            ) : substituteCandidates.length === 0 ? (
              <Text style={styles.emptyHint}>이 부위의 다른 종목이 없어요.</Text>
            ) : (
              <ScrollView style={styles.substituteList}>
                {substituteCandidates.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.substituteRow}
                    onPress={() => applySubstitute(c)}
                  >
                    <Text style={styles.substituteName}>{c.name}</Text>
                    {c.equipment ? <Text style={styles.substituteMeta}>{c.equipment}</Text> : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ② 역방향 루틴 저장 — 자유 세션 종료 시 다음에 원탭으로 시작할 수 있게 루틴화 제안 */}
      <Modal
        visible={saveRoutinePromptOpen}
        transparent
        animationType="fade"
        onRequestClose={skipSaveAsRoutine}
      >
        <Pressable style={styles.backdrop} onPress={skipSaveAsRoutine}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>이 기록을 새 루틴으로 저장할까요?</Text>
            <Text style={styles.modalLabel}>다음엔 원탭으로 오늘처럼 시작할 수 있어요</Text>
            <TextField
              label="루틴 이름"
              value={saveRoutineTitle}
              onChangeText={setSaveRoutineTitle}
              placeholder="예: 오늘 한 운동"
            />
            <View style={styles.formRow}>
              <Button title="건너뛰기" variant="ghost" onPress={skipSaveAsRoutine} style={styles.flex} />
              <Button
                title="루틴으로 저장"
                onPress={onSaveAsRoutine}
                loading={savingRoutine}
                style={styles.flex}
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
  progressBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  progressText: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  restPresets: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  restLabel: { fontSize: fontSize.caption, color: colors.textSecondary, marginRight: 2 },
  restChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  restChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  restChipTextActive: { color: colors.primary },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  exCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  exCardActive: { borderColor: colors.primary, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  exHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dragHandle: { paddingRight: spacing.xs, paddingVertical: 2 },
  dragHandleText: { fontSize: fontSize.subtitle, color: colors.textMuted, fontWeight: '800' },
  exName: { flex: 1, fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  exHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  exSwap: { fontSize: fontSize.body, color: colors.primary, fontWeight: '800' },
  exRemove: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '700' },
  exMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  setColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  setColHeaderIndex: { width: 20 },
  setColHeaderText: { flex: 1, fontSize: fontSize.caption, color: colors.textMuted, textAlign: 'center' },
  setColHeaderX: { width: 12 },
  setColHeaderCheck: { width: 40 },
  setRows: { gap: spacing.xs, marginTop: spacing.xs },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  setRowIndex: { width: 20, textAlign: 'center', fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  setInput: {
    flex: 1,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    textAlign: 'center',
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  setInputDone: { backgroundColor: colors.surface, color: colors.textSecondary },
  setRowX: { width: 12, textAlign: 'center', fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  setCheck: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  setCheckDone: { backgroundColor: colors.success, borderColor: colors.success },
  setCheckText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  setCheckTextDone: { color: colors.white },
  setAddRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  setAddText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  addExercise: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  addExerciseText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  emptyHint: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg, lineHeight: 20 },
  reorderHint: { fontSize: fontSize.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.sm },
  // 하단 영역 — 타이머는 이 영역을 기준으로 절대 위치 오버레이된다 (footer 를 밀지 않는다)
  bottomArea: { position: 'relative' },
  timerOverlay: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  timerText: { color: colors.white, fontSize: fontSize.subtitle, fontWeight: '800' },
  timerBtns: { flexDirection: 'row', gap: spacing.sm },
  timerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  timerBtnText: { color: colors.white, fontWeight: '800', fontSize: fontSize.caption },
  timerSkip: { backgroundColor: colors.white },
  timerSkipText: { color: colors.primaryDark, fontWeight: '800', fontSize: fontSize.caption },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  catChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  catText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  catTextActive: { color: colors.primary },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { marginTop: spacing.sm },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  groupChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  groupText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  groupTextActive: { color: colors.primary },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  presetChipText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  substituteList: { maxHeight: 280 },
  substituteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  substituteName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  substituteMeta: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
