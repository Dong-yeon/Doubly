/** 루틴 만들기 — 제목 + 운동 목록 추가 후 저장 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRoutineForm'>;

const CATEGORIES = ['근력', '유산소', '유연성'];

interface DraftExercise {
  key: string;
  name: string;
  category: string;
  targetSets?: number;
  reps?: number;
  weightKg?: number;
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
      },
    ]);
    setFName('');
    setFWeight('');
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
              </Text>
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

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAddOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
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
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg },
  modalTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  modalLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.xs },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  catChip: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  catText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700' },
  catTextActive: { color: colors.primary },
  formRow: { flexDirection: 'row', gap: spacing.sm },
  modalBtn: { marginTop: spacing.sm },
});
