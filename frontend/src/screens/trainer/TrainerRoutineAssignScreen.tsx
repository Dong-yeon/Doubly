/** 루틴 배정 — 트레이너가 회원에게 오늘/내일 운동 루틴 지정 (TRAINER-04) */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { trainerApi } from '../../api/trainer';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { toDateString } from '../../utils/date';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'TrainerRoutineAssign'>;

const DATE_OPTIONS = [
  { label: '오늘', offset: 0 },
  { label: '내일', offset: 1 },
  { label: '모레', offset: 2 },
] as const;

function dateFromOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toDateString(d);
}

export function TrainerRoutineAssignScreen({ navigation, route }: Props) {
  const { memberId, name } = route.params;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dateOffset, setDateOffset] = useState(0);
  const [saving, setSaving] = useState(false);

  const onAssign = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await trainerApi.assignRoutine({
        memberId,
        title: title.trim(),
        description: description.trim() || undefined,
        routineDate: dateFromOffset(dateOffset),
      });
      haptics.success();
      toast.success(`${name}님에게 루틴을 배정했어요 `);
      navigation.goBack();
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          <Text style={styles.label}>수행일</Text>
          <View style={styles.dateRow}>
            {DATE_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.offset}
                style={[styles.dateChip, dateOffset === o.offset && styles.dateChipActive]}
                onPress={() => setDateOffset(o.offset)}
              >
                <Text style={[styles.dateText, dateOffset === o.offset && styles.dateTextActive]}>
                  {o.label} · {dateFromOffset(o.offset).slice(5)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextField
            label="루틴 제목"
            placeholder="예: 하체 집중 루틴"
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
          <TextField
            label="상세 내용 (선택)"
            placeholder={'예: 스쿼트 4x10 60kg\n레그프레스 4x12\n런지 3x10'}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <Button
            title="루틴 배정하기"
            onPress={onAssign}
            loading={saving}
            disabled={!title.trim()}
            style={styles.submit}
          />
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  label: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dateChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  dateChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  dateText: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '600' },
  dateTextActive: { color: colors.textPrimary, fontWeight: '800' },
  submit: { marginTop: spacing.lg },
}));
