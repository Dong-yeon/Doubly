/**
 * 약관 재동의 게이트 (AUTH-09)
 *
 * 약관이 개정됐거나(버전 불일치) 동의 이력이 없는 기존 가입자(V23 이전)는
 * user.requiresConsent 가 true 로 내려온다. RootNavigator 가 이 화면을 메인 대신
 * 띄워, 현재 버전 약관에 동의할 때까지 앱 진입을 막는다.
 */
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Checkbox } from '../../components/Checkbox';
import { LegalDocumentScreen } from './LegalDocumentScreen';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { PRIVACY_VERSION, TERMS_VERSION } from '../../constants/legal';
import { colors, fontSize, spacing } from '../../constants/theme';

export function ConsentGateScreen() {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<'terms' | 'privacy' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const allAgreed = agreeTerms && agreePrivacy;
  const toggleAll = (checked: boolean) => {
    setAgreeTerms(checked);
    setAgreePrivacy(checked);
  };

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      // 갱신된 user 의 requiresConsent 가 false 가 되면 게이트가 내려간다
      setUser(await authApi.agreeToCurrentTerms());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>약관이 새로워졌어요</Text>
        <Text style={styles.subtitle}>
          이용약관과 개인정보처리방침이 개정되었어요.{'\n'}
          계속 이용하려면 새 약관에 동의해주세요.
        </Text>

        <Card elevation="md" style={styles.card}>
          <Checkbox checked={allAgreed} onChange={toggleAll} label="전체 동의" emphasized />
          <Text style={styles.divider} />
          <Checkbox
            checked={agreeTerms}
            onChange={setAgreeTerms}
            label={`[필수] 이용약관 동의 (v${TERMS_VERSION})`}
            trailing={
              <Button title="보기" variant="ghost" size="md" onPress={() => setViewingDoc('terms')} />
            }
          />
          <Checkbox
            checked={agreePrivacy}
            onChange={setAgreePrivacy}
            label={`[필수] 개인정보 수집·이용 동의 (v${PRIVACY_VERSION})`}
            trailing={
              <Button title="보기" variant="ghost" size="md" onPress={() => setViewingDoc('privacy')} />
            }
          />
          <Text style={styles.note}>
            동의하지 않으면 서비스를 계속 이용할 수 없어요. 기록된 데이터는 그대로 유지돼요.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title="동의하고 계속하기"
            onPress={onSubmit}
            loading={loading}
            disabled={!allAgreed || loading}
            style={styles.submit}
          />
        </Card>

        <Button title="로그아웃" variant="ghost" size="md" onPress={logout} />
      </ScrollView>

      {/* 약관 전문 — 게이트가 네비게이터 밖 단일 화면이라 Modal 로 띄운다 */}
      <Modal visible={viewingDoc !== null} animationType="slide" onRequestClose={() => setViewingDoc(null)}>
        {viewingDoc ? (
          <LegalDocumentScreen
            navigation={{ goBack: () => setViewingDoc(null) }}
            route={{ params: { doc: viewingDoc } }}
          />
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: '800', color: colors.textPrimary, marginLeft: spacing.xs },
  subtitle: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    marginLeft: spacing.xs,
  },
  card: { gap: spacing.xs, marginBottom: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  note: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginTop: spacing.xs,
    marginLeft: spacing.xs,
  },
  error: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.sm, marginLeft: spacing.xs },
  submit: { marginTop: spacing.md },
});
