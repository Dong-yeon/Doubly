/**
 * 설정 (SET-01).
 *
 * 그동안 백엔드에만 있고 화면이 없어 닿지 못하던 기능들을 모은 곳이다
 * — 비밀번호 변경, 알림 수신, 마케팅 동의 철회, 약관 열람.
 */
import React, { useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Alert } from '../../utils/alert';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { toast } from '../../store/toastStore';
import { APP_VERSION } from '../../constants/config';
import { CONTACT_EMAIL, PRIVACY_VERSION, TERMS_VERSION } from '../../constants/legal';
import { colors, fontSize, spacing } from '../../constants/theme';

type Props = NativeStackScreenProps<HomeStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [savingNotification, setSavingNotification] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);

  // 서버가 값을 안 내려주는 구버전 응답에서도 안전하게 동작하도록 기본값을 둔다
  const notificationsEnabled = user?.notificationsEnabled ?? true;
  const marketingConsent = user?.marketingConsent ?? false;

  const onToggleNotification = async (next: boolean) => {
    setSavingNotification(true);
    try {
      setUser(await authApi.updateNotificationSetting(next));
      toast.success(next ? '알림을 받아요.' : '알림을 껐어요.');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingNotification(false);
    }
  };

  const onToggleMarketing = async (next: boolean) => {
    setSavingMarketing(true);
    try {
      setUser(await authApi.updateMarketingConsent(next));
      toast.success(next ? '마케팅 수신에 동의했어요.' : '마케팅 수신을 철회했어요.');
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSavingMarketing(false);
    }
  };

  const isSocialAccount = !!user?.socialType && user.socialType !== 'EMAIL';

  /**
   * 문의·버그 신고 — 메일 앱을 연다.
   * 앱 버전·플랫폼을 본문에 미리 채워 베타 리포트 분류를 돕는다.
   */
  const onContact = async () => {
    const subject = `[Doubly 문의] `;
    const body =
      `\n\n----------\n`
      + `아래 정보는 문제 확인용이에요. 지워도 괜찮아요.\n`
      + `앱 버전: ${APP_VERSION}\n`
      + `기기: ${Platform.OS} ${Platform.Version}\n`;
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        // 메일 앱이 없는 기기 — 주소라도 안내한다
        Alert.alert('문의 이메일', `메일 앱을 열 수 없어요.\n${CONTACT_EMAIL} 로 보내주세요.`);
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert('문의 이메일', `${CONTACT_EMAIL} 로 보내주세요.`);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>알림</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>푸시 알림</Text>
              <Text style={styles.rowDesc}>상대방 활동·채팅·기념일 알림을 받아요.</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggleNotification}
              disabled={savingNotification}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>마케팅 정보 수신</Text>
              <Text style={styles.rowDesc}>이벤트·혜택 소식을 받아요. (선택)</Text>
            </View>
            <Switch
              value={marketingConsent}
              onValueChange={onToggleMarketing}
              disabled={savingMarketing}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>계정</Text>
          {isSocialAccount ? (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitleMuted}>비밀번호 변경</Text>
                <Text style={styles.rowDesc}>소셜 로그인 계정은 비밀번호를 사용하지 않아요.</Text>
              </View>
            </View>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
              onPress={() => navigation.navigate('ChangePassword')}
            >
              <Text style={styles.rowTitle}>비밀번호 변경</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>약관 및 정책</Text>
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
          >
            <Text style={styles.rowTitle}>이용약관</Text>
            <Text style={styles.version}>v{TERMS_VERSION}</Text>
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
          >
            <Text style={styles.rowTitle}>개인정보처리방침</Text>
            <Text style={styles.version}>v{PRIVACY_VERSION}</Text>
          </Pressable>
        </Card>

        <Card elevation="sm" style={styles.section}>
          <Text style={styles.sectionLabel}>문의 및 지원</Text>
          <Pressable
            style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
            onPress={onContact}
            accessibilityRole="button"
            accessibilityLabel="문의 및 버그 신고"
          >
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>문의 · 버그 신고</Text>
              <Text style={styles.rowDesc}>불편한 점이나 오류를 알려주세요.</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        </Card>

        <Text style={styles.appVersion}>Doubly v{APP_VERSION}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  section: { paddingVertical: spacing.sm },
  sectionLabel: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minHeight: 56,
    gap: spacing.md,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: fontSize.subtitle, color: colors.textPrimary, fontWeight: '600' },
  rowTitleMuted: { fontSize: fontSize.subtitle, color: colors.textSecondary, fontWeight: '600' },
  rowDesc: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    minHeight: 56,
  },
  pressed: { opacity: 0.6 },
  chevron: { fontSize: fontSize.title, color: colors.textSecondary },
  version: { fontSize: fontSize.caption, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginHorizontal: spacing.lg },
  appVersion: {
    textAlign: 'center',
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
