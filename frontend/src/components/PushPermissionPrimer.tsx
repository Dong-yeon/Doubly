/**
 * 푸시 권한 사전 설명 (pre-permission) — 콜드 프롬프트 방지.
 *
 * OS 권한창을 설명 없이 바로 띄우면 거부율이 높고 인상이 나쁘다.
 * 먼저 앱 안에서 이유를 설명하고, 사용자가 "받기"를 누를 때만 OS 창을 띄운다.
 *
 * 인증된 사용자에게 한 번만 노출한다(doubly.pushPrimed 플래그).
 * 이미 허용/거부한 사용자(undetermined 아님)에게는 나타나지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Button } from './Button';
import { storage } from '../utils/storage';
import { STORAGE_KEYS } from '../constants/config';
import { canAskPushPermission, requestPushPermission } from '../utils/push';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

export function PushPermissionPrimer() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const primed = await storage.getItem(STORAGE_KEYS.pushPrimed).catch(() => null);
      if (primed) return;
      const canAsk = await canAskPushPermission();
      if (!cancelled && canAsk) {
        // 홈이 자리잡은 뒤 부드럽게 노출
        setTimeout(() => {
          if (!cancelled) setVisible(true);
        }, 1200);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = async () => {
    // 허용/나중에 어느 쪽이든 다시 묻지 않는다
    await storage.setItem(STORAGE_KEYS.pushPrimed, 'true');
    setVisible(false);
  };

  const onAllow = async () => {
    setRequesting(true);
    try {
      await requestPushPermission(); // 허용되면 토큰 등록까지 내부에서 처리
    } finally {
      setRequesting(false);
      await dismiss();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="bell-ring-outline" size={40} color={colors.violet} />
          </View>
          <Text style={styles.title}>알림을 받을까요?</Text>
          <Text style={styles.desc}>
            상대방의 운동·기록·기념일 소식을{'\n'}놓치지 않게 알려드려요.
          </Text>

          <Button
            title="알림 받기"
            onPress={onAllow}
            loading={requesting}
            disabled={requesting}
            style={styles.allowBtn}
          />
          <Pressable
            onPress={dismiss}
            disabled={requesting}
            style={({ pressed }) => [styles.later, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="나중에"
          >
            <Text style={styles.laterText}>나중에</Text>
          </Pressable>
          <Text style={styles.note}>알림은 설정에서 언제든 끌 수 있어요.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 22, 43, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.togetherBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: fontSize.title, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 },
  desc: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  allowBtn: { alignSelf: 'stretch' },
  later: { minHeight: 44, justifyContent: 'center', marginTop: spacing.xs },
  pressed: { opacity: 0.6 },
  laterText: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600' },
  note: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: spacing.sm },
}));
