/** 트레이너 등록 — 프로필 입력 후 역할 승격 (TRAINER-01) */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { trainerApi } from '../../api/trainer';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { haptics } from '../../utils/haptics';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'TrainerRegister'>;

export function TrainerRegisterScreen({ navigation }: Props) {
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [specialty, setSpecialty] = useState('');
  const [career, setCareer] = useState('');
  const [introduction, setIntroduction] = useState('');
  const [saving, setSaving] = useState(false);

  const onRegister = async () => {
    setSaving(true);
    try {
      await trainerApi.register({
        specialty: specialty.trim() || undefined,
        career: career.trim() || undefined,
        introduction: introduction.trim() || undefined,
      });
      await refreshMe(); // 역할(TRAINER) 갱신
      haptics.success();
      toast.success('트레이너로 등록되었어요! 🏋️');
      navigation.replace('TrainerDashboard');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>🏋️ 트레이너로 활동하기</Text>
          <Text style={styles.desc}>
            등록하면 회원을 초대해 운동 현황을 관리할 수 있어요.{'\n'}프로필은 나중에 수정할 수 있어요.
          </Text>

          <TextField
            label="전문 분야 (선택)"
            placeholder="예: 다이어트, 근력 강화, 재활"
            value={specialty}
            onChangeText={setSpecialty}
            maxLength={100}
          />
          <TextField
            label="경력 (선택)"
            placeholder="예: 생활스포츠지도사 2급, 5년차 PT"
            value={career}
            onChangeText={setCareer}
            multiline
          />
          <TextField
            label="소개 (선택)"
            placeholder="회원에게 보여줄 한마디를 적어주세요"
            value={introduction}
            onChangeText={setIntroduction}
            multiline
          />

          <Button title="트레이너로 등록하기" onPress={onRegister} loading={saving} style={styles.submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  desc: { fontSize: fontSize.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 20 },
  submit: { marginTop: spacing.lg },
});
