/** 운동 기록 입력 — 설계서 2.4 / WORKOUT-01 (운동 선택·세트·시간) */
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { WorkoutStackParamList } from '../../navigation/types';
import type { WorkoutSet } from '../../types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { DateField } from '../../components/DateField';
import { NumberStepper } from '../../components/NumberStepper';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { Chip } from '../../components/Chip';
import { useWorkoutStore } from '../../store/workoutStore';
import { useRelationStore } from '../../store/relationStore';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
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

export function WorkoutRecordScreen({ navigation, route }: Props) {
  const save = useWorkoutStore((s) => s.save);
  /** 최근 기록 — 같은 운동의 직전 값을 불러오는 데 쓴다 */
  const history = useWorkoutStore((s) => s.history);
  const fetchHistory = useWorkoutStore((s) => s.fetchHistory);
  /*
   * 탭바 FAB 로 바로 들어오면 운동 목록을 거치지 않아 history 가 비어 있다.
   * 그때만 한 번 받아온다 — 이미 있으면 그대로 쓴다(불필요한 재조회 방지).
   */
  useEffect(() => {
    if (history.length === 0) void fetchHistory().catch(() => undefined);
    // 최초 1회만 — history 를 의존성에 넣으면 응답마다 다시 돈다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const couple = useRelationStore((s) => s.couple);
  const [sets, setSets] = useState<SetForm[]>([emptySet()]);
  /** 기록할 날짜 — 캘린더에서 날짜를 골라 들어오면 그 날짜, 아니면 오늘 */
  const [workoutDate, setWorkoutDate] = useState(route.params?.date ?? toDateString());
  const [duration, setDuration] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 입력이 하나라도 있으면 이탈(뒤로가기·스와이프) 전에 확인한다
  const dirty =
    duration.trim().length > 0 ||
    memo.trim().length > 0 ||
    sets.some((s) => s.exerciseName.trim() || s.sets || s.reps || s.weightKg);
  const allowLeave = useDirtyGuard(dirty);

  const updateSet = (idx: number, patch: Partial<SetForm>) => {
    setSets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const addSet = () => setSets((prev) => [...prev, emptySet()]);
  const removeSet = (idx: number) => setSets((prev) => prev.filter((_, i) => i !== idx));

  /*
   * 직전 기록 찾기 — 같은 운동을 마지막으로 했을 때의 무게·횟수·세트.
   *
   * 회차 간 변화폭이 작아서(보통 그대로거나 2.5kg 차이) 지난 값이 채워져 있으면
   * 대부분 그대로 저장하거나 한두 번 눌러 조정하면 끝난다. 매번 빈 칸에서
   * 시작하던 것이 반복 입력 피로의 가장 큰 원인이었다.
   */
  const lastSetOf = useCallback(
    (exerciseName: string): WorkoutSet | undefined => {
      const name = exerciseName.trim();
      if (!name) return undefined;
      for (const w of history) {
        const hit = w.sets.find((s) => s.exerciseName === name);
        if (hit) return hit;
      }
      return undefined;
    },
    [history],
  );

  /** 직전 기록을 해당 칸에 채운다 (사용자가 명시적으로 누를 때만) */
  const applyLast = (idx: number, exerciseName: string) => {
    const last = lastSetOf(exerciseName);
    if (!last) return;
    updateSet(idx, {
      sets: last.sets != null ? String(last.sets) : '',
      reps: last.reps != null ? String(last.reps) : '',
      weightKg: last.weightKg != null ? String(last.weightKg) : '',
      category: last.category ?? undefined,
    });
    haptics.light();
  };

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
        workoutDate,
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

      /*
       * 저장이 끝나면 공유 여부와 무관하게 화면부터 닫는다.
       * goBack 을 공유 Alert 의 버튼 안에만 두면, Android 에서 바깥 탭·뒤로가기로
       * Alert 를 닫았을 때 입력이 채워진 화면이 스택에 남아 "완료!" 재탭으로
       * 같은 기록이 중복 등록된다 (식단 기록과 동일 패턴).
       */
      allowLeave();
      navigation.goBack();

      // 커플이 연결돼 있으면 채팅 공유 제안 (CHAT-04)
      if (couple?.id) {
        const summary = `${filled.map((s) => s.exerciseName.trim()).join(', ')}${
          duration ? ` · ${duration}분` : ''
        }`;
        Alert.alert('운동 완료! ', '이 운동을 채팅에 공유할까요?', [
          { text: '다음에', style: 'cancel' },
          {
            text: '공유하기',
            onPress: async () => {
              await publishEnsuringConnection(couple.id, {
                messageType: 'WORKOUT_CARD',
                content: summary,
                workoutId: saved.id,
              });
              toast.success('채팅에 공유했어요 ');
            },
          },
        ]);
      }
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          {/*
            날짜를 고를 수 있게 한다 — 예전엔 저장 시각의 오늘로 고정이라
            "어제 운동을 깜빡하고 오늘 기록"이 아예 불가능했다.
            미래 날짜는 아직 하지 않은 운동이므로 오늘까지만 허용한다.
          */}
          <DateField
            label="운동한 날"
            value={workoutDate}
            onChange={setWorkoutDate}
            max={toDateString()}
            pickerTitle="언제 한 운동인가요?"
          />

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

              {/*
                지난 값 불러오기 — 자동으로 덮어쓰지 않고 버튼으로 둔다.
                오늘 다른 무게로 하려던 사용자의 입력을 말없이 바꿔버리면 안 된다.
              */}
              {(() => {
                const last = lastSetOf(s.exerciseName);
                if (!last) return null;
                const summary = [
                  last.sets != null ? `${last.sets}세트` : null,
                  last.reps != null ? `${last.reps}회` : null,
                  last.weightKg != null ? `${last.weightKg}kg` : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TouchableOpacity
                    style={styles.lastHint}
                    onPress={() => applyLast(idx, s.exerciseName)}
                    accessibilityRole="button"
                    accessibilityLabel={`지난 기록 ${summary} 불러오기`}
                  >
                    <MaterialCommunityIcons name="history" size={14} color={colors.primary} />
                    <Text style={styles.lastHintText}>지난 기록 {summary} 불러오기</Text>
                  </TouchableOpacity>
                );
              })()}

              <View style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={s.category === c}
                    onPress={() => updateSet(idx, { category: s.category === c ? undefined : c })}
                  />
                ))}
              </View>

              {/*
                +/- 로 조정한다 — 회차 간 변화폭이 작아 타이핑보다 훨씬 빠르다.
                무게는 원판 단위(2.5kg)로 움직인다.
              */}
              <View style={styles.row}>
                <NumberStepper
                  label="세트"
                  placeholder="3"
                  value={s.sets}
                  onChange={(v) => updateSet(idx, { sets: v })}
                />
                <NumberStepper
                  label="횟수"
                  placeholder="10"
                  value={s.reps}
                  onChange={(v) => updateSet(idx, { reps: v })}
                />
                <NumberStepper
                  label="무게(kg)"
                  placeholder="40"
                  value={s.weightKg}
                  onChange={(v) => updateSet(idx, { weightKg: v })}
                  step={2.5}
                  decimal
                />
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
      </FormKeyboardView>
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
  // 형제 화면(세션·루틴 폼·대결)과 동일한 칩 스타일 — 하드코딩 민트는 다크모드에서 깨졌다
  catChipActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  catText: { color: colors.textSecondary, fontSize: fontSize.caption },
  catTextActive: { color: colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: spacing.sm },
  lastHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44, // 반복해서 누르는 버튼이라 타깃을 확보한다
    marginBottom: spacing.xs,
  },
  lastHintText: { fontSize: fontSize.caption, color: colors.primary, fontWeight: '700' },
  flex1: { flex: 1 },
  meta: { marginTop: spacing.sm },
  save: { marginTop: spacing.md },
});
