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
import { Checkbox } from '../../components/Checkbox';
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
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allAgreed = agreeTerms && agreePrivacy && agreeMarketing;
  const toggleAll = (checked: boolean) => {
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
    setAgreeMarketing(checked);
  };

  const onSubmit = async () => {
    setError(null);
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.');
      return;
    }
    setLoading(true);
    try {
      await register({
        email: email.trim(),
        password,
        name: name.trim(),
        gender,
        agreeTerms,
        agreePrivacy,
        agreeMarketing,
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  // 필수 동의 두 개가 모두 켜져야 가입할 수 있다(서버도 동일하게 강제한다)
  const canSubmit = !!email && !!password && !!name && agreeTerms && agreePrivacy && !loading;

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

            <View style={styles.consent}>
              <Checkbox
                checked={allAgreed}
                onChange={toggleAll}
                label="전체 동의"
                emphasized
              />
              <View style={styles.consentDivider} />
              <Checkbox
                checked={agreeTerms}
                onChange={setAgreeTerms}
                label="[필수] 이용약관 동의"
                trailing={
                  <Button
                    title="보기"
                    variant="ghost"
                    size="md"
                    onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
                  />
                }
              />
              <Checkbox
                checked={agreePrivacy}
                onChange={setAgreePrivacy}
                label="[필수] 개인정보 수집·이용 동의"
                trailing={
                  <Button
                    title="보기"
                    variant="ghost"
                    size="md"
                    onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
                  />
                }
              />
              <Checkbox
                checked={agreeMarketing}
                onChange={setAgreeMarketing}
                label="[선택] 마케팅 정보 수신 동의"
              />
              <Text style={styles.consentNote}>
                만 14세 미만은 가입할 수 없어요. 선택 항목은 동의하지 않아도 가입할 수 있고,
                나중에 언제든 바꿀 수 있어요.
              </Text>
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
  consent: { marginTop: spacing.sm, marginBottom: spacing.sm },
  consentDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  consentNote: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  error: { color: colors.danger, fontSize: fontSize.caption, marginBottom: spacing.sm, marginLeft: spacing.xs },
  submit: { marginTop: spacing.sm },
});
