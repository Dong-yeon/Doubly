/** 로그인 — 미니멀·발랄 톤. 설계서 2.1 / 3.1 (이메일 로그인) */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
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

          {/*
            폼은 카드가 아니라 페이지 위에 놓인다 — 토스·카카오·당근의 로그인이 그렇다. 그림자 카드
            다섯 화면(로그인·가입·비밀번호 둘·약관 게이트)을 같은 날 함께 걷어냈다(§8-3 2번).
          */}
          <View style={styles.form}>
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
            {/* 보조 동선은 44px 고스트 버튼이 아니라 한 줄 링크 — 문장 하나에 버튼 한 줄을 주지 않는다 */}
            <View style={styles.linkRow}>
              <Pressable onPress={() => navigation.navigate('ForgotPassword')} hitSlop={8} accessibilityRole="link">
                <Text style={styles.link}>비밀번호를 잊으셨나요?</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.linkRow}>
            <Text style={styles.linkLead}>아직 계정이 없나요?</Text>
            <Pressable onPress={() => navigation.navigate('Register')} hitSlop={8} accessibilityRole="link">
              <Text style={styles.link}>회원가입</Text>
            </Pressable>
          </View>
      </FormKeyboardView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { fontSize: fontSize.caption, color: colors.textSecondary },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.ink, marginTop: spacing.sm, letterSpacing: -1 },
  slogan: { fontSize: fontSize.subtitle, color: colors.textSecondary, marginTop: spacing.xs },
  form: { gap: spacing.xs },
  formError: { color: colors.danger, fontSize: fontSize.caption, marginTop: -4 },
  loginBtn: { marginTop: spacing.sm },
  // 한 줄 링크 — 문장 + 링크. 링크는 primary 글자색, 44px 터치는 hitSlop 으로
  linkRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, minHeight: 44, marginTop: spacing.sm },
  linkLead: { color: colors.textSecondary, fontSize: fontSize.body },
  link: { color: colors.primary, fontSize: fontSize.body, fontWeight: '700' },
}));
