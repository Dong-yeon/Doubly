/**
 * 알림 종류 — 설정 > 알림 > 알림 종류. 2026-09-23 에 설정 본 화면에서 분리했다
 * (docs/SCREEN_DESIGN_PASS_2026-09-23.md §2-4 — 알림 카드 셋이 한 페이지에 나란히 있었다).
 *
 * 보내는 도메인(운동/식단/맛집…)이 아니라 사용자가 체감하는 성가심의 결로 나눈다
 * (서버 `NotificationCategory` 와 1:1). 도메인으로 나누면 이 목록이 20줄이 되고,
 * 어느 걸 꺼야 조용해지는지 알 수 없다.
 */
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Alert } from '../../utils/alert';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList';
import { authApi } from '../../api/auth';
import { useAuthStore } from '../../store/authStore';
import { getErrorMessage } from '../../utils/error';
import { spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

const NOTIFICATION_CATEGORIES = [
  { key: 'chat', field: 'notifyChat', title: '채팅 · 전화' },
  { key: 'anniversary', field: 'notifyAnniversary', title: '기념일 · 일정' },
  { key: 'partner', field: 'notifyPartner', title: '상대 활동' },
  { key: 'reminder', field: 'notifyReminder', title: '리마인드' },
] as const;

export function NotificationCategoriesScreen() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const notificationsEnabled = user?.notificationsEnabled ?? true;
  /** 저장 중인 카테고리 키 — 카테고리마다 상태를 두면 네 개가 되므로 하나로 관리한다 */
  const [saving, setSaving] = useState<string | null>(null);

  const onToggle = async (key: string, next: boolean) => {
    setSaving(key);
    try {
      setUser(await authApi.updateNotificationCategories({ [key]: next }));
    } catch (e) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <SettingsGroup
          footer={
            notificationsEnabled
              ? '채팅·전화는 메시지와 부재중, 기념일·일정은 당일과 D-7·D-1, 상대 활동은 상대가 남긴 기록, 리마인드는 스트릭·오늘의 질문·추억처럼 앱이 먼저 부르는 알림이에요.'
              : '푸시 알림이 꺼져 있어요. 설정에서 켜면 여기서 고른 것만 와요.'
          }
        >
          {NOTIFICATION_CATEGORIES.map((c) => (
            <SettingsRow
              key={c.key}
              title={c.title}
              muted={!notificationsEnabled}
              switchValue={notificationsEnabled && (user?.[c.field] ?? true)}
              onSwitch={(next) => void onToggle(c.key, next)}
              disabled={!notificationsEnabled || saving === c.key}
            />
          ))}
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, paddingBottom: spacing.xl },
}));
