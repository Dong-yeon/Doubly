/**
 * 작업 진행 중 화면 잠금 오버레이 — busyStore 가 켜질 때만 뜬다.
 *
 * Modal 을 쓰는 이유: 네비게이터·탭바까지 덮어야 하고, 안드로이드 백 버튼도
 * (onRequestClose 를 비워) 삼켜서 작업 중 이탈을 막을 수 있다.
 */
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { useBusyStore } from '../store/busyStore';
import { colors, fontSize, radius, spacing } from '../constants/theme';

export function BusyOverlay() {
  const message = useBusyStore((s) => s.message);

  return (
    <Modal
      visible={message !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      // 작업 중에는 백 버튼으로 닫히지 않는다 (의도적으로 비움)
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.message}>{message}</Text>
          <Text style={styles.hint}>잠시만 기다려주세요</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minWidth: 200,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: spacing.sm,
  },
  message: {
    fontSize: fontSize.body,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  hint: { fontSize: fontSize.caption, color: colors.textSecondary },
});
