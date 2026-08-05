/** 운동 세션 보조 (Jefit/Strong 스타일) — 세트별 체크 + 휴식 타이머 + 세트 카운터.
 *  종료하면 완료한 세트가 운동 기록으로 저장된다. 루틴으로 실행 시 exercises 파라미터로 시작. */
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useWorkoutStore } from '../../store/workoutStore';
import { getErrorMessage } from '../../utils/error';
import { toDateString } from '../../utils/date';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { confirmDiscard } from '../../utils/discardGuard';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutSession'>;

const CATEGORIES = ['근력', '유산소', '유연성'];
const REST_PRESETS = [60, 90, 120];

interface SessionSet {
  done: boolean;
}
interface SessionExercise {
  key: string;
  name: string;
  category: string;
  reps?: number;
  weightKg?: number;
  sets: SessionSet[];
}

let keySeq = 0;
const nextKey = () => `ex-${keySeq++}`;

function mmss(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
      sets: Array.from({ length: Math.max(1, e.targetSets ?? 3) }, () => ({ done: false })),
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
        const sets = e.sets.map((s, i) => (i === idx ? { done: !s.done } : s));
        // 방금 '완료'로 바꿨으면 휴식 타이머 시작
        if (!e.sets[idx].done) setRest(restSeconds);
        return { ...e, sets };
      }),
    );
  };

  const addSetRow = (exKey: string) =>
    setExercises((prev) =>
      prev.map((e) => (e.key === exKey ? { ...e, sets: [...e.sets, { done: false }] } : e)),
    );

  const removeExercise = (exKey: string) =>
    setExercises((prev) => prev.filter((e) => e.key !== exKey));

  const onAddExercise = () => {
    if (!fName.trim()) {
      toast.error('운동 이름을 입력해주세요.');
      return;
    }
    const setCount = Math.max(1, Math.min(20, Number(fSets) || 3));
    setExercises((prev) => [
      ...prev,
      {
        key: nextKey(),
        name: fName.trim(),
        category: fCategory,
        reps: fReps ? Number(fReps) : undefined,
        weightKg: fWeight ? Number(fWeight) : undefined,
        sets: Array.from({ length: setCount }, () => ({ done: false })),
      },
    ]);
    setFName('');
    setFWeight('');
    setAddOpen(false);
  };

  const onFinish = async () => {
    const payloadSets = exercises
      .map((e, i) => ({ e, completed: e.sets.filter((s) => s.done).length, order: i + 1 }))
      .filter((x) => x.completed > 0)
      .map((x) => ({
        exerciseName: x.e.name,
        category: x.e.category,
        sets: x.completed,
        reps: x.e.reps ?? null,
        weightKg: x.e.weightKg != null ? String(x.e.weightKg) : null,
        orderNo: x.order,
      }));
    if (payloadSets.length === 0) {
      toast.error('완료한 세트가 없어요. 세트를 체크해주세요!');
      return;
    }
    setSaving(true);
    try {
      await save({ workoutDate: toDateString(), sets: payloadSets as never });
      haptics.success();
      toast.success('운동 완료! 기록했어요 ');
      allowLeave();
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  /*
   * 이탈 가드 — 예전 confirmExit 은 하단 "종료" 버튼에만 걸려 있어서
   * 헤더 뒤로가기·하드웨어 백·스와이프백으로 나가면 체크한 세트가 통째로 사라졌다.
   * usePreventRemove 기반 훅은 모든 이탈 경로를 가로챈다.
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

      <ScrollView contentContainerStyle={styles.list}>
        {exercises.map((e) => {
          const done = e.sets.filter((s) => s.done).length;
          return (
            <View key={e.key} style={styles.exCard}>
              <View style={styles.exHeader}>
                <Text style={styles.exName}>{e.name}</Text>
                <TouchableOpacity onPress={() => removeExercise(e.key)} hitSlop={8}>
                  <Text style={styles.exRemove}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.exMeta}>
                {e.category}
                {e.reps ? ` · ${e.reps}회` : ''}
                {e.weightKg ? ` · ${e.weightKg}kg` : ''} · {done}/{e.sets.length} 세트
              </Text>
              <View style={styles.setGrid}>
                {e.sets.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.setCell, s.done && styles.setCellDone]}
                    onPress={() => toggleSet(e.key, i)}
                  >
                    <Text style={[styles.setCellText, s.done && styles.setCellTextDone]}>
                      {s.done ? '✓' : i + 1}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={styles.setAdd} onPress={() => addSetRow(e.key)}>
                  <Text style={styles.setAddText}>＋</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity style={styles.addExercise} onPress={() => setAddOpen(true)}>
          <Text style={styles.addExerciseText}>＋ 운동 추가</Text>
        </TouchableOpacity>

        {exercises.length === 0 ? (
          <Text style={styles.emptyHint}>운동을 추가하고 세트를 체크하면{'\n'}자동으로 휴식 타이머가 돌아가요.</Text>
        ) : null}
      </ScrollView>

      {/* 휴식 타이머 바 */}
      {rest > 0 ? (
        <View style={styles.timerBar}>
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

      {/* 하단 액션 */}
      <View style={styles.footer}>
        {/* 세트를 체크했으면 useDirtyGuard 가 확인 다이얼로그를 띄운다 */}
        <Button title="종료" variant="ghost" size="md" onPress={() => navigation.goBack()} style={styles.flex} />
        <Button title="운동 완료" size="md" onPress={onFinish} loading={saving} style={styles.flex} />
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
              <Button title="추가" onPress={onAddExercise} style={styles.modalBtn} />
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  exHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exName: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  exRemove: { fontSize: fontSize.body, color: colors.textMuted, fontWeight: '700' },
  exMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  setGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  setCell: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  setCellDone: { backgroundColor: colors.success, borderColor: colors.success },
  setCellText: { fontSize: fontSize.body, fontWeight: '800', color: colors.textSecondary },
  setCellTextDone: { color: colors.white },
  setAdd: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setAddText: { fontSize: fontSize.subtitle, color: colors.textMuted },
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
  timerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
});
