/** 회원가입 — 미니멀·발랄 톤. 설계서 2.1 / 3.1 AUTH-03 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Card } from '../../components/Card';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import type { Gender } from '../../types';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const register = useAuthStore((s) => s.register);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      await register({ email: email.trim(), password, name: name.trim(), gender });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !!email && !!password && !!name && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>반가워요! </Text>
          <Text style={styles.subtitle}>함께 운동할 준비를 시작해요</Text>

          <Card elevation="md" style={styles.card}>
            <TextField
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextField
              label="비밀번호 (8자 이상)"
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
            />
            <TextField label="이름" value={name} onChangeText={setName} placeholder="이름/닉네임" />

            <Text style={styles.fieldLabel}>성별 (선택)</Text>
            <View style={styles.genderRow}>
              {(['MALE', 'FEMALE'] as const).map((g) => (
                <Pressable
                  key={g}
                  style={({ pressed }) => [
                    styles.genderChip,
                    gender === g && styles.genderChipActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setGender(gender === g ? undefined : g)}
                >
                  <Text style={[styles.genderText, gender === g && styles.genderTextActive]}>
                    {g === 'MALE' ? '남성' : '여성'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button title="가입하고 시작하기" onPress={onSubmit} loading={loading} disabled={!canSubmit} style={styles.submit} />
          </Card>

          <Button title="이미 계정이 있어요" variant="ghost" size="md" onPress={() => navigation.goBack()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.textPrimary, marginLeft: spacing.xs },
  subtitle: { fontSize: fontSize.body, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.lg, marginLeft: spacing.xs },
  card: { gap: spacing.xs },
  fieldLabel: { fontSize: fontSize.caption, color: colors.textSecondary, fontWeight: '700', marginBottom: spacing.sm, marginLeft: spacing.xs },
  genderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  genderChip: {
    flex: 1,
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  genderChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  genderText: { color: colors.textSecondary, fontWeight: '700' },
  genderTextActive: { color: colors.primaryDark },
  pressed: { transform: [{ scale: 0.97 }] },
  error: { color: colors.danger, fontSize: fontSize.caption, marginBottom: spacing.sm, marginLeft: spacing.xs },
  submit: { marginTop: spacing.sm },
});
