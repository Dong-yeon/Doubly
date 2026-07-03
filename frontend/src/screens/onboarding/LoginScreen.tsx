/** 로그인 — 미니멀·발랄 톤. 설계서 2.1 / 3.1 (이메일 로그인) */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Card } from '../../components/Card';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { colors, fontSize, spacing } from '../../constants/theme';

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
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={styles.logo}>👩‍❤️‍👨</Text>
            <Text style={styles.brand}>Fitto</Text>
            <Text style={styles.slogan}>함께라서 더 건강해</Text>
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
              errorText={error ?? undefined}
            />
            <Button title="로그인" onPress={onSubmit} loading={loading} disabled={!canSubmit} style={styles.loginBtn} />
          </Card>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>아직 계정이 없나요?</Text>
            <Button title="이메일로 회원가입" variant="ghost" size="md" onPress={() => navigation.navigate('Register')} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 56 },
  brand: { fontSize: fontSize.display, fontWeight: '800', color: colors.primary, marginTop: spacing.xs, letterSpacing: -0.5 },
  slogan: { fontSize: fontSize.subtitle, color: colors.textSecondary, marginTop: spacing.xs },
  card: { gap: spacing.xs },
  loginBtn: { marginTop: spacing.sm },
  signupRow: { alignItems: 'center', marginTop: spacing.lg, gap: spacing.xs },
  signupText: { color: colors.textSecondary, fontSize: fontSize.body },
});
