/** 비밀번호 재설정 — 인증코드 확인 + 새 비밀번호 설정 (AUTH-07) */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Card } from '../../components/Card';
import { authApi } from '../../api/auth';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'ResetPassword'>;

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordScreen({ navigation, route }: Props) {
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // 서버도 8자 이상을 요구하지만, 왕복 없이 즉시 알려주는 편이 낫다
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), code.trim(), password);
      toast.success('비밀번호가 변경되었어요. 새 비밀번호로 로그인해주세요.');
      // 재설정 성공 시 서버가 모든 세션을 폐기하므로 로그인부터 다시 시작한다
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setError(null);
    setResending(true);
    try {
      await authApi.forgotPassword(email.trim());
      toast.info('인증코드를 다시 보냈어요. 이전 코드는 사용할 수 없어요.');
      setCode('');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setResending(false);
    }
  };

  const canSubmit =
    email.trim().length > 0 &&
    code.trim().length === 6 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm &&
    !loading;

  return (
    // 헤더가 상단 인셋을 처리하므로 top 을 빼서 이중 여백을 막는다
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.title}>새 비밀번호 설정</Text>
            <Text style={styles.desc}>
              메일로 받은 6자리 코드를 입력하고{'\n'}새 비밀번호를 정해주세요. 코드는 10분간 유효해요.
            </Text>
          </View>

          <Card elevation="md" style={styles.card}>
            <TextField
              label="이메일"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextField
              label="인증코드 6자리"
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              style={styles.codeInput}
            />
            <TextField
              label="새 비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
              secureTextEntry
              autoComplete="new-password"
              errorText={passwordTooShort ? `${MIN_PASSWORD_LENGTH}자 이상 입력해주세요.` : undefined}
            />
            <TextField
              label="새 비밀번호 확인"
              value={confirm}
              onChangeText={setConfirm}
              placeholder="한 번 더 입력"
              secureTextEntry
              autoComplete="new-password"
              errorText={mismatch ? '비밀번호가 일치하지 않아요.' : (error ?? undefined)}
            />
            <Button
              title="비밀번호 변경"
              onPress={onSubmit}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitBtn}
            />
          </Card>

          <View style={styles.footer}>
            <Button
              title="인증코드 다시 받기"
              variant="ghost"
              size="md"
              loading={resending}
              disabled={email.trim().length === 0 || resending}
              onPress={onResend}
            />
            <Button
              title="로그인으로 돌아가기"
              variant="ghost"
              size="md"
              onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] })}
            />
          </View>
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  title: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -1,
  },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: { gap: spacing.xs },
  codeInput: { letterSpacing: 8, fontSize: fontSize.title, fontWeight: '700' },
  submitBtn: { marginTop: spacing.sm },
  footer: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
});
