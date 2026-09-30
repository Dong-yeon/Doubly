/**
 * 강제 업데이트 — 설치된 빌드가 status.json 의 minAppVersion 보다 낮으면 앱 전체를 덮는다.
 *
 * <p>닫을 수 없다(안드로이드 뒤로가기도 무시). 이 값을 올리는 건 "이 빌드로는 계속 쓰면 안 된다"는
 * 판단이 섰을 때뿐이어야 한다 — 잘못 올리면 전원이 잠기므로 운영 절차의 경고를 먼저 읽는다
 * (docs/INCIDENT_NOTICE_2026-09-30.md). 판정이 서지 않으면(웹·버전 읽기 실패·형식 오류) 띄우지 않는다.
 *
 * <p>App.tsx 루트에 둔다 — 로그인 전 화면에서도, 홈이 아닌 화면에서도 걸려야 한다.
 */
import React from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootOverlayModal } from './RootOverlayModal';
import { Button } from './Button';
import { MaterialCommunityIcons } from './Icon';
import { useServiceStatusStore } from '../store/serviceStatusStore';
import { needsUpdate } from '../utils/serviceStatus';
import { nativeAppVersion } from '../utils/appVersion';
import { STORE_URLS } from '../constants/config';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

const DEFAULT_MESSAGE = '더 안정적인 더블리를 위해 새 버전이 필요해요. 스토어에서 업데이트한 뒤 다시 열어주세요.';

export function ForceUpdateGate() {
  const status = useServiceStatusStore((s) => s.status);
  const current = nativeAppVersion();
  if (!needsUpdate(status, Platform.OS, current)) return null;

  const storeUrl = Platform.OS === 'ios' ? STORE_URLS.ios : STORE_URLS.android;
  return (
    <RootOverlayModal visible animationType="fade" onRequestClose={() => undefined}>
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <MaterialCommunityIcons name="cellphone-arrow-down" size={48} color={colors.primary} />
          <Text style={styles.title} accessibilityRole="header">
            업데이트가 필요해요
          </Text>
          <Text style={styles.body}>{status?.updateMessage ?? DEFAULT_MESSAGE}</Text>
          <Text style={styles.version}>현재 버전 {current}</Text>
        </View>
        <Button
          title="스토어에서 업데이트"
          onPress={() => void Linking.openURL(storeUrl).catch(() => undefined)}
          style={styles.button}
        />
      </SafeAreaView>
    </RootOverlayModal>
  );
}

const styles = themedStyles((c) => ({
  root: { flex: 1, backgroundColor: c.background, padding: spacing.lg, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  title: { fontSize: fontSize.subtitle, fontWeight: '700', color: c.textPrimary, marginTop: spacing.sm },
  body: { fontSize: fontSize.body, color: c.textSecondary, textAlign: 'center', lineHeight: 21 },
  version: { fontSize: fontSize.caption, color: c.textMuted },
  button: { marginBottom: spacing.md },
}));
