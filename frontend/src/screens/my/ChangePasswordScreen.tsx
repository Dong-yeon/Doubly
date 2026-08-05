/** 비밀번호 변경 — AUTH-08. 변경 시 모든 기기에서 로그아웃된다. */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Card } from '../../components/Card';
import { FormKeyboardView } from '../../components/FormKeyboardView';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'ChangePassword'>;

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordScreen({ navigation }: Props) {
  const logout = useAuthStore((s) => s.logout);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && next !== confirm;
  const sameAsCurrent = next.length > 0 && next === current;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      /*
       * 서버가 변경과 동시에 모든 리프레시 토큰을 폐기한다.
       * 클라이언트에 남은 토큰으로는 갱신이 불가능하므로, 여기서 로그아웃까지 해줘야
       * 사용자가 "왜 갑자기 로그인이 풀리지"를 겪지 않는다.
       */
      toast.success('비밀번호를 변경했어요. 다시 로그인해주세요.');
      await logout();
    } catch (e) {
      setError(getErrorMessage(e));
      setLoading(false);
    }
  };

  const canSubmit =
    current.length > 0 &&
    next.length >= MIN_PASSWORD_LENGTH &&
    next === confirm &&
    !sameAsCurrent &&
    !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FormKeyboardView contentContainerStyle={styles.container}>
          <Text style={styles.desc}>
            비밀번호를 변경하면 <Text style={styles.bold}>모든 기기에서 로그아웃</Text>되고
            다시 로그인해야 해요.
          </Text>

          <Card elevation="md" style={styles.card}>
            <TextField
              label="현재 비밀번호"
              value={current}
              onChangeText={setCurrent}
              placeholder="현재 비밀번호"
              secureTextEntry
              autoComplete="current-password"
            />
            <TextField
              label="새 비밀번호"
              value={next}
              onChangeText={setNext}
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
              secureTextEntry
              autoComplete="new-password"
              errorText={
                tooShort
                  ? `${MIN_PASSWORD_LENGTH}자 이상 입력해주세요.`
                  : sameAsCurrent
                    ? '현재 비밀번호와 다른 비밀번호를 입력해주세요.'
                    : undefined
              }
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
              style={styles.submit}
            />
          </Card>

          <View style={styles.footer}>
            <Button
              title="비밀번호가 기억나지 않나요?"
              variant="ghost"
              size="md"
              onPress={() =>
                Alert.alert(
                  '비밀번호 재설정',
                  '로그아웃한 뒤 로그인 화면의 "비밀번호를 잊으셨나요?"에서 이메일로 재설정할 수 있어요.',
                )
              }
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
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  bold: { fontWeight: '800', color: colors.textPrimary },
  card: { gap: spacing.xs },
  submit: { marginTop: spacing.sm },
  footer: { alignItems: 'center', marginTop: spacing.md },
});
