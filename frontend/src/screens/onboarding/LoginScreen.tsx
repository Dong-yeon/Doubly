/** 로그인 — 미니멀·발랄 톤. 설계서 2.1 / 3.1 (이메일 로그인) */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Card } from '../../components/Card';
import { DoublyMark } from '../../components/DoublyLogo';
import { GoogleLoginButton } from '../../components/GoogleLoginButton';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { isGoogleLoginConfigured } from '../../constants/config';
import { colors, fontSize, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = email.length > 0 && password.length > 0 && !loading;

  return (
    <SafeAreaView style={styles.safe}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          <View style={styles.hero}>
            <DoublyMark size={56} />
            <Text style={styles.brand}>Dubly</Text>
            <Text style={styles.slogan}>둘이라서, 두 배로</Text>
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
              label="비밀번호"
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              secureTextEntry
            />
            {/* 로그인 실패는 이메일·비밀번호 어느 쪽 문제인지 서버 메시지만으론 특정할 수
                없다(예: "가입되지 않은 이메일"). 비밀번호 칸에만 붙이면 오해를 부르므로
                폼 공용 에러로 둔다. */}
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <Button title="로그인" onPress={onSubmit} loading={loading} disabled={!canSubmit} style={styles.loginBtn} />
            {isGoogleLoginConfigured() ? (
              <>
                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는</Text>
                  <View style={styles.dividerLine} />
                </View>
                <GoogleLoginButton onError={setError} />
              </>
            ) : null}
            <Button
              title="비밀번호를 잊으셨나요?"
              variant="ghost"
              size="md"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
          </Card>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>아직 계정이 없나요?</Text>
            <Button title="이메일로 회원가입" variant="ghost" size="md" onPress={() => navigation.navigate('Register')} />
          </View>
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSize.caption, color: colors.textSecondary },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 56 },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.ink, marginTop: spacing.sm, letterSpacing: -1 },
  slogan: { fontSize: fontSize.subtitle, color: colors.textSecondary, marginTop: spacing.xs },
  card: { gap: spacing.xs },
  formError: { color: colors.danger, fontSize: fontSize.caption, marginTop: -4 },
  loginBtn: { marginTop: spacing.sm },
  signupRow: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  signupText: { color: colors.textSecondary, fontSize: fontSize.body },
}));
