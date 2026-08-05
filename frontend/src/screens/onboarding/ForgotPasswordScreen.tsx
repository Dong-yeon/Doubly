/** 비밀번호 찾기 — 인증코드 발송 (AUTH-07) */
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
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const trimmed = email.trim();
    try {
      await authApi.forgotPassword(trimmed);
      // 서버는 가입 여부와 무관하게 성공을 준다 — 여기서도 동일하게 코드 입력 화면으로 넘어가
      // "가입되지 않은 이메일입니다" 같은 힌트를 주지 않는다.
      navigation.navigate('ResetPassword', { email: trimmed });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.trim().length > 0 && !loading;

  return (
    // 헤더가 상단 인셋을 처리하므로 top 을 빼서 이중 여백을 막는다
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <Text style={styles.title}>비밀번호 찾기</Text>
            <Text style={styles.desc}>
              가입한 이메일로 6자리 인증코드를 보내드려요.
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
              errorText={error ?? undefined}
            />
            <Button
              title="인증코드 받기"
              onPress={onSubmit}
              loading={loading}
              disabled={!canSubmit}
              style={styles.submitBtn}
            />
          </Card>

          <View style={styles.footer}>
            <Button
              title="이미 코드를 받았어요"
              variant="ghost"
              size="md"
              onPress={() => navigation.navigate('ResetPassword', { email: email.trim() })}
            />
            <Button
              title="로그인으로 돌아가기"
              variant="ghost"
              size="md"
              onPress={() => navigation.goBack()}
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
  submitBtn: { marginTop: spacing.sm },
  footer: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
});
