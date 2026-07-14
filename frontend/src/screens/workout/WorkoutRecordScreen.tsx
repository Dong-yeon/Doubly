/** 운동 기록 입력 — 설계서 2.4 / WORKOUT-01 (운동 선택·세트·시간) */
import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { useWorkoutStore } from '../../store/workoutStore';
import { useRelationStore } from '../../store/relationStore';
import { publishEnsuringConnection } from '../../api/chatSocket';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<WorkoutStackParamList, 'WorkoutRecord'>;

const CATEGORIES = ['근력', '유산소', '유연성'];

interface SetForm {
  exerciseName: string;
  category?: string;
  sets: string;
  reps: string;
  weightKg: string;
}

const emptySet = (): SetForm => ({ exerciseName: '', sets: '', reps: '', weightKg: '' });

// 자주 하는 운동 — 빠른 선택
const PRESETS: { name: string; category: string }[] = [
  { name: '벤치프레스', category: '근력' },
  { name: '스쿼트', category: '근력' },
  { name: '데드리프트', category: '근력' },
  { name: '풀업', category: '근력' },
  { name: '러닝', category: '유산소' },
  { name: '사이클', category: '유산소' },
  { name: '플랭크', category: '유연성' },
  { name: '요가', category: '유연성' },
];

export function WorkoutRecordScreen({ navigation }: Props) {
  const save = useWorkoutStore((s) => s.save);
  const couple = useRelationStore((s) => s.couple);
  const [sets, setSets] = useState<SetForm[]>([emptySet()]);
  const [duration, setDuration] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  const updateSet = (idx: number, patch: Partial<SetForm>) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSet = () => setSets((prev) => [...prev, emptySet()]);
  const removeSet = (idx: number) => setSets((prev) => prev.filter((_, i) => i !== idx));

  // 프리셋 탭: 비어있는 첫 세트에 채우고, 없으면 새 세트로 추가
  const applyPreset = (preset: { name: string; category: string }) => {
    setSets((prev) => {
      const emptyIdx = prev.findIndex((s) => !s.exerciseName.trim());
      if (emptyIdx >= 0) {
        return prev.map((s, i) =>
          i === emptyIdx ? { ...s, exerciseName: preset.name, category: preset.category } : s,
        );
      }
      return [...prev, { ...emptySet(), exerciseName: preset.name, category: preset.category }];
    });
  };

  const onSave = async () => {
    const filled = sets.filter((s) => s.exerciseName.trim().length > 0);
    if (filled.length === 0) {
      Alert.alert('알림', '운동명을 최소 1개 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      const saved = await save({
        workoutDate: toDateString(),
        totalDurationMin: duration ? Number(duration) : undefined,
        memo: memo.trim() || undefined,
        sets: filled.map((s, i) => ({
          exerciseName: s.exerciseName.trim(),
          category: s.category ?? null,
          sets: s.sets ? Number(s.sets) : null,
          reps: s.reps ? Number(s.reps) : null,
          weightKg: s.weightKg ? Number(s.weightKg) : null,
          orderNo: i + 1,
        })),
      });
      haptics.success();
      toast.success('운동 기록 완료! ');

      // 커플이 연결돼 있으면 채팅 공유 제안 (CHAT-04)
      if (couple?.id) {
        const summary = `${filled.map((s) => s.exerciseName.trim()).join(', ')}${
          duration ? ` · ${duration}분` : ''
        }`;
        Alert.alert('운동 완료! ', '이 운동을 채팅에 공유할까요?', [
          { text: '다음에', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: '공유하기',
            onPress: async () => {
              await publishEnsuringConnection(couple.id, {
                messageType: 'WORKOUT_CARD',
                content: summary,
                workoutId: saved.id,
              });
              toast.success('채팅에 공유했어요 ');
              navigation.goBack();
            },
          },
        ]);
        return;
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.date}>{toDateString()}</Text>

          <Text style={styles.presetLabel}>자주 하는 운동</Text>
          <View style={styles.presetRow}>
            {PRESETS.map((p) => (
              <TouchableOpacity key={p.name} style={styles.presetChip} onPress={() => applyPreset(p)}>
                <Text style={styles.presetText}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {sets.map((s, idx) => (
            <View key={idx} style={styles.setCard}>
              <View style={styles.setHeader}>
                <Text style={styles.setNo}>운동 {idx + 1}</Text>
                {sets.length > 1 ? (
                  <TouchableOpacity onPress={() => removeSet(idx)}>
                    <Text style={styles.remove}>삭제</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <TextField
                placeholder="운동명 (예: 벤치프레스)"
                value={s.exerciseName}
                onChangeText={(t) => updateSet(idx, { exerciseName: t })}
              />

              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, s.category === c && styles.catChipActive]}
                    onPress={() => updateSet(idx, { category: s.category === c ? undefined : c })}
                  >
                    <Text style={[styles.catText, s.category === c && styles.catTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.row}>
                <View style={styles.flex1}>
                  <TextField
                    label="세트"
                    placeholder="3"
                    keyboardType="number-pad"
                    value={s.sets}
                    onChangeText={(t) => updateSet(idx, { sets: t.replace(/[^0-9]/g, '') })}
                  />
                </View>
                <View style={styles.flex1}>
                  <TextField
                    label="횟수"
                    placeholder="10"
                    keyboardType="number-pad"
                    value={s.reps}
                    onChangeText={(t) => updateSet(idx, { reps: t.replace(/[^0-9]/g, '') })}
                  />
                </View>
                <View style={styles.flex1}>
                  <TextField
                    label="무게(kg)"
                    placeholder="40"
                    keyboardType="decimal-pad"
                    value={s.weightKg}
                    onChangeText={(t) => updateSet(idx, { weightKg: t.replace(/[^0-9.]/g, '') })}
                  />
                </View>
              </View>
            </View>
          ))}

          <Button title="＋ 운동 추가" variant="ghost" onPress={addSet} />

          <View style={styles.meta}>
            <TextField
              label="총 운동 시간 (분)"
              placeholder="40"
              keyboardType="number-pad"
              value={duration}
              onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, ''))}
            />
            <TextField
              label="메모"
              placeholder="오늘의 한마디"
              value={memo}
              onChangeText={setMemo}
              multiline
            />
          </View>

          <Button title="완료!" onPress={onSave} loading={saving} style={styles.save} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  date: { fontSize: fontSize.subtitle, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.md },
  presetLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  presetChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetText: { fontSize: fontSize.caption, color: colors.textPrimary, fontWeight: '600' },
  setCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  setHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  setNo: { fontSize: fontSize.body, fontWeight: '700', color: colors.primary },
  remove: { color: colors.danger, fontSize: fontSize.caption },
  catRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  catChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: { borderColor: colors.secondary, backgroundColor: '#E6F7F2' },
  catText: { color: colors.textSecondary, fontSize: fontSize.caption },
  catTextActive: { color: colors.secondary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex1: { flex: 1 },
  meta: { marginTop: spacing.sm },
  save: { marginTop: spacing.md },
});
