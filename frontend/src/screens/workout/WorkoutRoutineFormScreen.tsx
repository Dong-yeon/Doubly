/** 루틴 만들기 — 제목 + 운동 목록 추가 후 저장.
 *  세트 프리셋으로 1탭 완성, 종목별 휴식 시간, 대체 종목 사전 지정을 지원한다. */
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { workoutApi } from '../../api/workout';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { ExerciseCatalogItem } from '../../types';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutineForm'>;

const CATEGORIES = ['근력', '유산소', '유연성'];
const MUSCLE_GROUPS = ['가슴', '등', '어깨', '하체', '팔', '코어', '전신'];
const REST_PRESETS = [60, 90, 120, 180];
const MAX_ALTERNATIVES = 3;

// ③ 세트 프리셋 — 세트를 하나씩 누를 필요 없이 종목 추가 시 1탭으로 세트/횟수 틀을 완성한다.
const SET_PRESETS: { label: string; sets: number; reps: number; hint?: string }[] = [
  { label: '5×5', sets: 5, reps: 5 },
  { label: '3×10', sets: 3, reps: 10 },
  { label: '4×8', sets: 4, reps: 8 },
  { label: '탑세트+백오프', sets: 4, reps: 8, hint: '1세트는 무겁게, 나머지는 가볍게 조절하세요' },
];

interface DraftAlternative {
  exerciseCatalogId: number;
  name: string;
  muscleGroup: string;
  equipment?: string | null;
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
}

let seq = 0;

export function WorkoutRoutineFormScreen({ navigation }: Props) {
  const [title, setTitle] = useState('');
  const [exercises, setExercises] = useState<DraftExercise[]>([]);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState('');
  const [fCategory, setFCategory] = useState('근력');
  const [fSets, setFSets] = useState('3');
  const [fReps, setFReps] = useState('10');
  const [fWeight, setFWeight] = useState('');
  const [fRestSeconds, setFRestSeconds] = useState<number | null>(null);
  const [fPresetHint, setFPresetHint] = useState<string | null>(null);
  const [fAlternatives, setFAlternatives] = useState<DraftAlternative[]>([]);

  // 대체 종목 탐색 — 자극 부위 칩으로 카탈로그 검색
  const [altGroup, setAltGroup] = useState(MUSCLE_GROUPS[0]);
  const [altCandidates, setAltCandidates] = useState<ExerciseCatalogItem[]>([]);
  const [altLoading, setAltLoading] = useState(false);

  useEffect(() => {
    if (!addOpen) return;
    setAltLoading(true);
    workoutApi
      .exerciseCatalog(altGroup)
      .then(setAltCandidates)
      .catch(() => setAltCandidates([]))
      .finally(() => setAltLoading(false));
  }, [addOpen, altGroup]);

  const applyPreset = (preset: (typeof SET_PRESETS)[number]) => {
    haptics.light();
    setFSets(String(preset.sets));
    setFReps(String(preset.reps));
    setFPresetHint(preset.hint ?? null);
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

  const resetAddForm = () => {
    setFName('');
    setFCategory('근력');
    setFSets('3');
    setFReps('10');
    setFWeight('');
    setFRestSeconds(null);
    setFPresetHint(null);
    setFAlternatives([]);
    setAltGroup(MUSCLE_GROUPS[0]);
  };

  // 운동 추가 모달 닫기 — 입력이 있으면 확인 후 닫는다 (백드롭·Android 백 공용).
  // "사라져요"라고 안내했으므로 닫을 때 실제로 비운다 (남기면 다음에 또 확인이 뜬다)
  const closeAddModal = () =>
    confirmDiscard(fName.trim().length > 0 || fWeight.trim().length > 0, () => {
      setAddOpen(false);
      setFName('');
      setFWeight('');
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
        exercises: exercises.map((e) => ({
          exerciseName: e.name,
          category: e.category,
          targetSets: e.targetSets,
          reps: e.reps,
          weightKg: e.weightKg,
          restSeconds: e.restSeconds,
          alternativeExerciseCatalogIds: e.alternatives.map((a) => a.exerciseCatalogId),
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

        <Text style={styles.label}>운동 ({exercises.length})</Text>
        {exercises.map((e) => (
          <View key={e.key} style={styles.exRow}>
            <View style={styles.flex}>
              <Text style={styles.exName}>{e.name}</Text>
              <Text style={styles.exMeta}>
                {e.category}
                {e.targetSets ? ` · ${e.targetSets}세트` : ''}
                {e.reps ? ` · ${e.reps}회` : ''}
                {e.weightKg ? ` · ${e.weightKg}kg` : ''}
                {e.restSeconds ? ` · 휴식 ${e.restSeconds}s` : ''}
              </Text>
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
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>운동 추가</Text>
                <TextField label="운동 이름" placeholder="예: 랫풀다운" value={fName} onChangeText={setFName} />
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

                <Text style={styles.modalLabel}>휴식 시간 (종목별 지정, 생략 시 세션 기본값)</Text>
                <View style={styles.groupRow}>
                  {REST_PRESETS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.catChipSmall, fRestSeconds === r && styles.catChipActive]}
                      onPress={() => setFRestSeconds((prev) => (prev === r ? null : r))}
                    >
                      <Text style={[styles.catText, fRestSeconds === r && styles.catTextActive]}>{r}s</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.modalLabel}>
                  대체 종목 (선택, 최대 {MAX_ALTERNATIVES}개) — 헬스장에서 기구가 겹칠 때 1탭으로 바꿀 종목
                </Text>
                <View style={styles.groupRow}>
                  {MUSCLE_GROUPS.map((g) => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.catChipSmall, altGroup === g && styles.catChipActive]}
                      onPress={() => setAltGroup(g)}
                    >
                      <Text style={[styles.catText, altGroup === g && styles.catTextActive]}>{g}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {altLoading ? (
                  <Text style={styles.emptyHint}>불러오는 중…</Text>
                ) : (
                  <View style={styles.groupRow}>
                    {altCandidates
                      .filter((c) => c.name !== fName.trim())
                      .map((c) => {
                        const selected = fAlternatives.some((a) => a.exerciseCatalogId === c.id);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.catChipSmall, selected && styles.catChipActive]}
                            onPress={() => toggleAlternative(c)}
                          >
                            <Text style={[styles.catText, selected && styles.catTextActive]}>
                              {selected ? '✓ ' : ''}
                              {c.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </View>
                )}

                <Button title="추가" onPress={onAddExercise} style={styles.modalBtn} />
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
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
  emptyHint: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
