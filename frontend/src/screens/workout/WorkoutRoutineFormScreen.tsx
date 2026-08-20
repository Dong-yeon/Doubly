/** 루틴 만들기 — 제목 + 요일 배정 + 운동 목록 추가 후 저장.
 *  요일을 골라두면(짐워크 스타일) 루틴 목록에서 오늘 할 루틴이 앞으로 오고 "오늘" 배지가 붙는다.
 *  종목은 카탈로그에서 골라 자극 부위·기구가 자동으로 붙고(대체 종목 추천의 전제),
 *  세트 프리셋으로 1탭 완성하거나 세트마다 다른 무게·횟수(램프업/백오프)를 계획할 수 있다.
 *  종목별 휴식 시간, 대체 종목 사전 지정도 지원한다. */
import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Chip } from '../../components/Chip';
import { ExercisePickerModal } from '../../components/workout/ExercisePickerModal';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { confirmDiscard } from '../../utils/discardGuard';
import { recommendRestSeconds } from '../../utils/restRecommend';
import { WEEK_DAYS } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { ExerciseCatalogItem, WeekDay } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutineForm'>;

const CATEGORIES = ['근력', '유산소', '유연성'];
const REST_PRESETS = [60, 90, 120, 180];
const MAX_ALTERNATIVES = 3;
// 카탈로그 이름 검색 결과로 보여줄 최대 후보 수 — 많아 봐야 스크롤만 늘어난다
const MAX_NAME_SUGGESTIONS = 6;

// ③ 세트 프리셋 — 세트를 하나씩 누를 필요 없이 종목 추가 시 1탭으로 세트/횟수 틀을 완성한다.
// '탑세트+백오프'는 세트마다 무게가 달라 균등 그리드로 표현할 수 없으므로, 이 프리셋만
// 탭하면 아래 세트별 편집기가 곧바로 열린다(1세트 TOP + 나머지 BACKOFF).
const SET_PRESETS: { label: string; sets: number; reps: number; hint?: string }[] = [
  { label: '5×5', sets: 5, reps: 5 },
  { label: '3×10', sets: 3, reps: 10 },
  { label: '4×8', sets: 4, reps: 8 },
  { label: '탑세트+백오프', sets: 4, reps: 8, hint: '탑세트는 무겁게, 백오프는 가볍게 — 아래에서 세트별로 무게를 채워주세요' },
];

/** 세트 성격 — UI 배지 표시용. 계산 로직에는 쓰지 않는다(서버도 마찬가지). */
type SetType = 'NORMAL' | 'WARMUP' | 'TOP' | 'BACKOFF' | 'DROP';
const SET_TYPE_CYCLE: SetType[] = ['NORMAL', 'WARMUP', 'TOP', 'BACKOFF', 'DROP'];
const SET_TYPE_LABEL: Record<SetType, string> = {
  NORMAL: '일반',
  WARMUP: '웜업',
  TOP: '탑',
  BACKOFF: '백오프',
  DROP: '드롭',
};

interface DraftAlternative {
  exerciseCatalogId: number;
  name: string;
  muscleGroup: string;
  equipment?: string | null;
}
interface DraftSetRow {
  key: string;
  reps: string;
  weightKg: string;
  setType: SetType;
}
interface DraftExercise {
  key: string;
  name: string;
  category: string;
  targetSets?: number;
  reps?: number;
  weightKg?: number;
  restSeconds?: number;
  alternatives: DraftAlternative[];
  // 카탈로그에서 골랐을 때만 채워짐 — 자유 입력이면 전부 undefined(지금까지의 동작)
  muscleGroup?: string;
  equipment?: string;
  exerciseCatalogId?: number;
  // 세트별 목표 — 비어 있으면 위 targetSets/reps/weightKg 로 균등 세트를 쓴다
  sets: DraftSetRow[];
}

let seq = 0;
let setRowSeq = 0;

export function WorkoutRoutineFormScreen({ navigation, route }: Props) {
  // AI 추천(WorkoutRecommendScreen)에서 넘어올 때만 채워짐 — 카탈로그·세트별 목표·요일
  // 없이 바로 저장되던 것을, 이 화면에서 검토·수정한 뒤 명시적으로 저장하게 한다
  const draft = route.params?.draft;
  const [title, setTitle] = useState(draft?.title ?? '');
  // 이 루틴을 하는 요일 — 짐워크 스타일 "Day1은 월/목" 배정. 비워두면 자유 루틴
  const [scheduledDays, setScheduledDays] = useState<WeekDay[]>(draft?.scheduledDays ?? []);
  const [exercises, setExercises] = useState<DraftExercise[]>(() =>
    (draft?.exercises ?? []).map((e) => ({
      key: `d-${seq++}`,
      name: e.name,
      category: e.category ?? '근력',
      targetSets: e.targetSets ?? undefined,
      reps: e.reps ?? undefined,
      alternatives: [],
      sets: [],
    })),
  );
  const [saving, setSaving] = useState(false);

  // 헤더 제목 — AI 추천을 다듬으러 들어온 걸 알려준다 (스택 옵션은 "루틴 만들기"로 고정돼 있음)
  useLayoutEffect(() => {
    if (draft) navigation.setOptions({ title: 'AI 추천 다듬기' });
  }, [draft, navigation]);

  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('근력');
  const [fSets, setFSets] = useState('3');
  const [fReps, setFReps] = useState('10');
  const [fWeight, setFWeight] = useState('');
  const [fRestSeconds, setFRestSeconds] = useState<number | null>(null);
  const [fPresetHint, setFPresetHint] = useState<string | null>(null);
  const [fAlternatives, setFAlternatives] = useState<DraftAlternative[]>([]);
  // 이름 필드가 카탈로그 종목과 연결됐는지 — 연결되면 자극 부위·기구가 함께 저장된다
  const [fCatalog, setFCatalog] = useState<ExerciseCatalogItem | null>(null);
  const [fSetRows, setFSetRows] = useState<DraftSetRow[]>([]);

  // 대체 종목 탐색 — 부위→기구로 좁혀가며 고르는 ExercisePickerModal (다중 선택)
  const [altPickerOpen, setAltPickerOpen] = useState(false);

  // 운동 이름 자동완성 + 대체 종목 탐색용 전체 카탈로그 — 종목 수가 적어(수십 개) 한 번만
  // 받아 로컬에서 필터링한다(모달을 열 때마다 다시 요청하지 않는다)
  const [catalog, setCatalog] = useState<ExerciseCatalogItem[]>([]);
  useEffect(() => {
    workoutApi.exerciseCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  /*
   * AI 추천 초안으로 들어왔으면, 카탈로그가 로드되는 대로 이름이 정확히 일치하는 종목에
   * 자극 부위·기구를 자동으로 붙인다. 서버(WorkoutRoutineService.resolveCatalogByName)도
   * 같은 안전망이 있지만, 여기서 붙여야 화면에 바로 "가슴 · 바벨 연결됨"이 보이고 사용자가
   * 손대지 않고 그대로 저장해도 놓치지 않는다. catalog 는 마운트 시 한 번만 채워지므로
   * 무한 루프 걱정 없이 그 시점에 딱 한 번 돈다.
   */
  useEffect(() => {
    if (catalog.length === 0) return;
    setExercises((prev) =>
      prev.map((e) => {
        if (e.exerciseCatalogId) return e; // 이미 연결됐으면 손대지 않는다
        const match = catalog.find((c) => c.name === e.name);
        if (!match) return e;
        return { ...e, muscleGroup: match.muscleGroup, equipment: match.equipment ?? undefined, exerciseCatalogId: match.id };
      }),
    );
  }, [catalog]);

  // 입력 중인 이름과 일치하는 카탈로그 후보 — 이미 카탈로그를 골랐으면(fCatalog) 숨긴다
  const nameSuggestions = useMemo(() => {
    const q = fName.trim();
    if (!q || fCatalog) return [];
    return catalog.filter((c) => c.name.includes(q)).slice(0, MAX_NAME_SUGGESTIONS);
  }, [fName, fCatalog, catalog]);

  // 지금 입력된 반복 횟수 기준 휴식 시간 추천 — 세트마다 다르게 설정 중이면 그 종목의 목표가
  // 균일하지 않을 수 있어(램프업 등) 이땐 추천을 보여주지 않는다(간단 입력일 때만 유효)
  const restRecommendation = useMemo(
    () => (fSetRows.length === 0 ? recommendRestSeconds(Number(fReps)) : null),
    [fReps, fSetRows.length],
  );

  const onChangeName = (t: string) => {
    setFName(t);
    // 골라둔 카탈로그와 이름이 달라지면(직접 고쳐 씀) 연결을 해제 — 다른 종목인데
    // 이전 종목의 자극 부위가 그대로 남는 걸 막는다
    if (fCatalog && fCatalog.name !== t) setFCatalog(null);
  };

  const selectCatalog = (c: ExerciseCatalogItem) => {
    haptics.light();
    setFName(c.name);
    setFCategory(c.category);
    setFCatalog(c);
  };

  const newSetRow = (patch?: Partial<DraftSetRow>): DraftSetRow => ({
    key: `sr-${setRowSeq++}`,
    reps: fReps || '',
    weightKg: '',
    setType: 'NORMAL',
    ...patch,
  });

  const applyPreset = (preset: (typeof SET_PRESETS)[number]) => {
    haptics.light();
    setFSets(String(preset.sets));
    setFReps(String(preset.reps));
    setFPresetHint(preset.hint ?? null);
    // 프리셋은 "알아서 채워줘"라는 의도가 명확한 액션이라, 반복수에 맞는 휴식 시간도
    // 같이 채운다(사용자가 직접 반복수를 타이핑할 때는 힌트만 보여주고 건드리지 않는다).
    const rec = recommendRestSeconds(preset.reps);
    if (rec) setFRestSeconds(rec.seconds);
    if (preset.label === '탑세트+백오프') {
      // 이 프리셋만 세트마다 무게가 달라 균등 그리드로 표현할 수 없다 — 곧바로 세트별 편집을 연다
      setFSetRows([
        newSetRow({ reps: String(preset.reps), setType: 'TOP' }),
        ...Array.from({ length: preset.sets - 1 }, () => newSetRow({ reps: String(preset.reps), setType: 'BACKOFF' })),
      ]);
    } else {
      setFSetRows([]);
    }
  };

  // 세트별 편집 열기 — 지금 입력된 세트/횟수/무게를 그대로 N줄로 펼친다(값 손실 없이 시작)
  const openDetailedSets = () => {
    const count = Math.max(1, Number(fSets) || 3);
    setFSetRows(Array.from({ length: count }, () => newSetRow({ weightKg: fWeight || '' })));
  };

  const addSetRow = () =>
    setFSetRows((prev) => [
      // 직전 세트 값을 이어받는다 — 매번 같은 무게를 다시 입력하지 않아도 되게
      ...prev,
      newSetRow({ weightKg: prev[prev.length - 1]?.weightKg ?? fWeight ?? '' }),
    ]);
  const removeSetRow = (key: string) => setFSetRows((prev) => prev.filter((r) => r.key !== key));
  const updateSetRow = (key: string, patch: Partial<DraftSetRow>) =>
    setFSetRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const cycleSetType = (key: string) => {
    haptics.light();
    setFSetRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const idx = SET_TYPE_CYCLE.indexOf(r.setType);
        return { ...r, setType: SET_TYPE_CYCLE[(idx + 1) % SET_TYPE_CYCLE.length] };
      }),
    );
  };

  const toggleAlternative = (c: ExerciseCatalogItem) => {
    setFAlternatives((prev) => {
      const exists = prev.some((a) => a.exerciseCatalogId === c.id);
      if (exists) return prev.filter((a) => a.exerciseCatalogId !== c.id);
      if (prev.length >= MAX_ALTERNATIVES) {
        toast.error(`대체 종목은 최대 ${MAX_ALTERNATIVES}개까지 지정할 수 있어요.`);
        return prev;
      }
      return [...prev, { exerciseCatalogId: c.id, name: c.name, muscleGroup: c.muscleGroup, equipment: c.equipment }];
    });
  };

  const toggleScheduledDay = (d: WeekDay) => {
    haptics.light();
    setScheduledDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const resetAddForm = () => {
    setFName('');
    setFCategory('근력');
    setFSets('3');
    setFReps('10');
    setFWeight('');
    setFRestSeconds(null);
    setFPresetHint(null);
    setFAlternatives([]);
    setFCatalog(null);
    setFSetRows([]);
  };

  // 운동 추가 모달 닫기 — 입력이 있으면 확인 후 닫는다 (백드롭·Android 백 공용).
  // "사라져요"라고 안내했으므로 닫을 때 실제로 비운다 (남기면 다음에 또 확인이 뜬다)
  const closeAddModal = () =>
    confirmDiscard(fName.trim().length > 0 || fWeight.trim().length > 0 || fSetRows.length > 0, () => {
      setAddOpen(false);
      setFName('');
      setFWeight('');
      setFSetRows([]);
    });

  const onAddExercise = () => {
    if (!fName.trim()) {
      toast.error('운동 이름을 입력해주세요.');
      return;
    }
    setExercises((prev) => [
      ...prev,
      {
        key: `d-${seq++}`,
        name: fName.trim(),
        category: fCategory,
        targetSets: fSets ? Number(fSets) : undefined,
        reps: fReps ? Number(fReps) : undefined,
        weightKg: fWeight ? Number(fWeight) : undefined,
        restSeconds: fRestSeconds ?? undefined,
        alternatives: fAlternatives,
        muscleGroup: fCatalog?.muscleGroup,
        equipment: fCatalog?.equipment ?? undefined,
        exerciseCatalogId: fCatalog?.id,
        sets: fSetRows,
      },
    ]);
    resetAddForm();
    setAddOpen(false);
  };

  const onSave = async () => {
    if (!title.trim()) {
      toast.error('루틴 이름을 입력해주세요.');
      return;
    }
    if (exercises.length === 0) {
      toast.error('운동을 하나 이상 추가해주세요.');
      return;
    }
    setSaving(true);
    try {
      await workoutApi.saveRoutine({
        title: title.trim(),
        scheduledDays: scheduledDays.length > 0 ? scheduledDays : undefined,
        exercises: exercises.map((e) => ({
          exerciseName: e.name,
          category: e.category,
          targetSets: e.targetSets,
          reps: e.reps,
          weightKg: e.weightKg,
          restSeconds: e.restSeconds,
          alternativeExerciseCatalogIds: e.alternatives.map((a) => a.exerciseCatalogId),
          exerciseCatalogId: e.exerciseCatalogId,
          muscleGroup: e.muscleGroup,
          equipment: e.equipment,
          // 세트별 목표가 있으면 그게 기준 — 서버가 targetSets/reps/weightKg 를 다시 계산한다
          sets:
            e.sets.length > 0
              ? e.sets.map((s) => ({
                  reps: s.reps ? Number(s.reps) : undefined,
                  weightKg: s.weightKg ? Number(s.weightKg) : undefined,
                  setType: s.setType !== 'NORMAL' ? s.setType : undefined,
                }))
              : undefined,
        })),
      });
      haptics.success();
      toast.success('루틴을 저장했어요 ');
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField label="루틴 이름" placeholder="예: 등·이두 데이" value={title} onChangeText={setTitle} maxLength={100} />

        {/*
          요일 배정(짐워크 스타일) — 미리 골라두면 루틴 목록에서 오늘 할 루틴이 앞으로 오고
          "오늘" 배지가 붙는다(WorkoutRoutineListScreen). 안 고르면 지금처럼 요일에
          매이지 않는 자유 루틴이라, 매주 루틴을 새로 짜지 않는 사용자는 그냥 건너뛰면 된다.
        */}
        <Text style={styles.label}>운동할 요일 (선택)</Text>
        <View style={styles.dayRow}>
          {WEEK_DAYS.map((d) => (
            <Chip
              key={d.value}
              label={d.label}
              selected={scheduledDays.includes(d.value)}
              onPress={() => toggleScheduledDay(d.value)}
              fill
            />
          ))}
        </View>
        <Text style={styles.dayHint}>
          {scheduledDays.length > 0
            ? `${WEEK_DAYS.filter((d) => scheduledDays.includes(d.value)).map((d) => d.label).join('·')}요일마다 이 루틴을 하도록 표시할게요.`
            : '고르지 않으면 요일에 매이지 않는 자유 루틴이 돼요.'}
        </Text>

        <Text style={styles.label}>운동 ({exercises.length})</Text>
        {exercises.map((e) => (
          <View key={e.key} style={styles.exRow}>
            <View style={styles.flex}>
              <Text style={styles.exName}>{e.name}</Text>
              <Text style={styles.exMeta}>
                {e.muscleGroup ? `${e.muscleGroup} · ` : ''}
                {e.category}
                {e.targetSets ? ` · ${e.targetSets}세트` : ''}
                {e.reps ? ` · ${e.reps}회` : ''}
                {e.weightKg ? ` · ${e.weightKg}kg` : ''}
                {e.restSeconds ? ` · 휴식 ${e.restSeconds}s` : ''}
              </Text>
              {e.sets.length > 0 ? (
                <Text style={styles.exSets}>
                  {e.sets
                    .map((s, i) => {
                      const label = s.setType !== 'NORMAL' ? `${SET_TYPE_LABEL[s.setType]} ` : '';
                      return `${i + 1}) ${label}${s.reps || '-'}회${s.weightKg ? ` ${s.weightKg}kg` : ''}`;
                    })
                    .join(' · ')}
                </Text>
              ) : null}
              {e.alternatives.length > 0 ? (
                <Text style={styles.exAlt}>대체: {e.alternatives.map((a) => a.name).join(', ')}</Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setExercises((prev) => prev.filter((x) => x.key !== e.key))} hitSlop={8}>
              <Text style={styles.exRemove}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <TouchableOpacity style={styles.addExercise} onPress={() => setAddOpen(true)}>
          <Text style={styles.addExerciseText}>＋ 운동 추가</Text>
        </TouchableOpacity>

        <Button title="루틴 저장" onPress={onSave} loading={saving} style={styles.saveBtn} />
      </ScrollView>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={closeAddModal}>
        <Pressable style={styles.backdrop} onPress={closeAddModal}>
          {/* 키보드가 모달 하단 버튼을 가리지 않도록 카드째로 밀어올린다 */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>운동 추가</Text>
                <TextField label="운동 이름" placeholder="예: 랫풀다운" value={fName} onChangeText={onChangeName} />
                {/*
                  카탈로그 연결 상태 안내 — 예전엔 이 필드가 순수 자유 텍스트라 카탈로그와
                  전혀 연결되지 않았다. 그 결과 세션 중 "대체 종목으로 교체"를 열면 자극 부위가
                  항상 비어 있어 기본값(가슴)으로 고정됐다. 지금은 골라야만 연결되고,
                  무엇이 선택됐는지/왜 자유 입력이 되는지 여기서 바로 보여준다.
                */}
                {nameSuggestions.length > 0 ? (
                  <View style={styles.suggestRow}>
                    {nameSuggestions.map((c) => (
                      <TouchableOpacity key={c.id} style={styles.suggestChip} onPress={() => selectCatalog(c)}>
                        <Text style={styles.suggestChipText}>{c.name}</Text>
                        <Text style={styles.suggestChipMeta}>{c.muscleGroup}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : fCatalog ? (
                  <Text style={styles.catalogHint}>
                    ✓ {fCatalog.muscleGroup} · {fCatalog.equipment ?? '맨몸'} 종목으로 연결돼요 (대체 종목 추천에 쓰여요)
                  </Text>
                ) : fName.trim() ? (
                  <Text style={styles.catalogHintMuted}>카탈로그에 없는 이름이에요. 직접 만든 종목으로 저장할게요.</Text>
                ) : null}

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

                <Text style={styles.modalLabel}>세트 프리셋</Text>
                <View style={styles.groupRow}>
                  {SET_PRESETS.map((p) => (
                    <TouchableOpacity key={p.label} style={styles.presetChip} onPress={() => applyPreset(p)}>
                      <Text style={styles.presetChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {fPresetHint ? <Text style={styles.presetHint}>{fPresetHint}</Text> : null}

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

                {/*
                  세트마다 다르게 — 램프업/피라미드/드롭세트처럼 세트마다 무게·횟수가 다른 계획.
                  평소엔 접어둔다: 대부분의 종목은 세트마다 같은 값이라 위 3칸으로 충분하다.
                */}
                {fSetRows.length === 0 ? (
                  <TouchableOpacity onPress={openDetailedSets} style={styles.detailToggle}>
                    <Text style={styles.detailToggleText}>세트마다 다르게 설정 ›</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.setRowsWrap}>
                    <Text style={styles.modalLabel}>세트별 목표 — 배지를 탭해 성격을 바꿔요</Text>
                    {fSetRows.map((row, i) => (
                      <View key={row.key} style={styles.setRow}>
                        <Text style={styles.setRowIndex}>{i + 1}</Text>
                        <TextInput
                          style={styles.setInput}
                          value={row.weightKg}
                          onChangeText={(v) => updateSetRow(row.key, { weightKg: v.replace(/[^0-9.]/g, '') })}
                          keyboardType="decimal-pad"
                          placeholder="kg"
                          placeholderTextColor={colors.textTertiary}
                        />
                        <Text style={styles.setRowX}>×</Text>
                        <TextInput
                          style={styles.setInput}
                          value={row.reps}
                          onChangeText={(v) => updateSetRow(row.key, { reps: v.replace(/[^0-9]/g, '') })}
                          keyboardType="number-pad"
                          placeholder="회"
                          placeholderTextColor={colors.textTertiary}
                        />
                        <TouchableOpacity style={styles.setTypeChip} onPress={() => cycleSetType(row.key)}>
                          <Text style={styles.setTypeChipText}>{SET_TYPE_LABEL[row.setType]}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeSetRow(row.key)} hitSlop={8}>
                          <Text style={styles.setRowRemove}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <View style={styles.setRowActions}>
                      <TouchableOpacity style={styles.setAddRow} onPress={addSetRow}>
                        <Text style={styles.setAddText}>＋ 세트</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setFSetRows([])}>
                        <Text style={styles.detailCollapseText}>간단히 입력으로 되돌리기</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <Text style={styles.modalLabel}>휴식 시간 (종목별 지정, 생략 시 세션 기본값)</Text>
                {/* 목표 횟수 기반 추천 — 고중량·저반복(근력)은 길게, 고반복(근지구력)은 짧게.
                    자동 적용은 프리셋 탭에서만 하고(위 applyPreset), 여기선 힌트 + 칩 표시만 해서
                    직접 타이핑한 값을 마음대로 덮어쓰지 않는다. */}
                {restRecommendation ? (
                  <Text style={styles.restRecommendHint}>
                    💡 {fReps}회면 {restRecommendation.seconds}s 추천 — {restRecommendation.reason}
                  </Text>
                ) : null}
                <View style={styles.groupRow}>
                  {REST_PRESETS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.catChipSmall, fRestSeconds === r && styles.catChipActive]}
                      onPress={() => setFRestSeconds((prev) => (prev === r ? null : r))}
                    >
                      <Text style={[styles.catText, fRestSeconds === r && styles.catTextActive]}>
                        {r}s{restRecommendation?.seconds === r ? ' 💡' : ''}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>
                  대체 종목 (선택, 최대 {MAX_ALTERNATIVES}개) — 헬스장에서 기구가 겹칠 때 1탭으로 바꿀 종목
                </Text>
                <View style={styles.groupRow}>
                  {fAlternatives.map((a) => (
                    <TouchableOpacity
                      key={a.exerciseCatalogId}
                      style={[styles.catChipSmall, styles.catChipActive]}
                      onPress={() => setFAlternatives((prev) => prev.filter((x) => x.exerciseCatalogId !== a.exerciseCatalogId))}
                    >
                      <Text style={[styles.catText, styles.catTextActive]}>✓ {a.name}</Text>
                    </TouchableOpacity>
                  ))}
                  {fAlternatives.length < MAX_ALTERNATIVES ? (
                    <TouchableOpacity style={styles.presetChip} onPress={() => setAltPickerOpen(true)}>
                      <Text style={styles.presetChipText}>부위·기구로 찾기 ›</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <Button title="추가" onPress={onAddExercise} style={styles.modalBtn} />
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* 대체 종목 고르기 — 부위 → 기구 순으로 좁혀가며 최대 {MAX_ALTERNATIVES}개까지 다중 선택 */}
      <ExercisePickerModal
        visible={altPickerOpen}
        catalog={catalog}
        excludeName={fName.trim() || undefined}
        onClose={() => setAltPickerOpen(false)}
        multiSelect={{ selectedIds: fAlternatives.map((a) => a.exerciseCatalogId), max: MAX_ALTERNATIVES, onToggle: toggleAlternative }}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  dayRow: { flexDirection: 'row', gap: spacing.xs },
  dayHint: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  flex: { flex: 1 },
  exName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  exMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  exSets: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: 2 },
  exAlt: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: 2 },
  exRemove: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '700', paddingLeft: spacing.md },
  addExercise: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  addExerciseText: { fontSize: fontSize.body, fontWeight: '800', color: colors.primary },
  saveBtn: { marginTop: spacing.lg },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, maxHeight: '85%' },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.sm },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  catChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  catChipSmall: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  catText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  catTextActive: { color: colors.primary },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { marginTop: spacing.md },
  groupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  presetChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  presetChipText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  presetHint: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs },
  restRecommendHint: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '600', marginBottom: spacing.xs },
  emptyHint: { fontSize: fontSize.caption, color: colors.textSecondary },

  // 이름 자동완성 — 카탈로그 종목 후보 칩
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  suggestChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  suggestChipText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '700' },
  suggestChipMeta: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },
  catalogHint: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
  catalogHintMuted: { fontSize: fontSize.caption, color: colors.textTertiary, marginTop: spacing.xs },

  // 세트별 목표 편집 — 세션 화면의 세트 행과 같은 형태로 통일한다
  detailToggle: { marginTop: spacing.sm },
  detailToggleText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  detailCollapseText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  setRowsWrap: { marginTop: spacing.xs },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  setRowIndex: { width: 20, textAlign: 'center', fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  setInput: {
    flex: 1,
    // 웹 필수 — <input> 내재 최소 폭(~170px) 탓에 flex:1 이어도 안 줄어들어
    // 무게·횟수 두 칸이 화면 밖으로 넘쳤다 (WorkoutSessionScreen.setInput 과 동일).
    minWidth: 0,
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
  setRowX: { width: 12, textAlign: 'center', fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
  setTypeChip: {
    paddingHorizontal: spacing.sm,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  setTypeChipText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  setRowRemove: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '700', paddingHorizontal: spacing.xs },
  setRowActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  setAddRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  setAddText: { fontSize: fontSize.caption, color: colors.textMuted, fontWeight: '700' },
}));
