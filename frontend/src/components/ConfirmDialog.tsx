/**
 * 앱 디자인 확인 다이얼로그 — 모든 플랫폼 공통.
 *
 * 웹에서 `window.confirm` 을 쓰면 브라우저 기본 시스템 창이 떠서 앱과 이질적이고,
 * 선택지도 예/아니오 2개로 제한된다(카메라/갤러리/취소 같은 3지선다 불가).
 * 네이티브 Alert 과도 모양이 달라져 플랫폼마다 인상이 갈린다.
 * 그래서 한 컴포넌트로 통일한다.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useDialogStore, type DialogButton } from '../store/dialogStore';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

function textColor(style: DialogButton['style']): string {
  if (style === 'destructive') return colors.danger;
  if (style === 'cancel') return colors.textSecondary;
  return colors.primary;
}

export function ConfirmDialog() {
  const dialog = useDialogStore((s) => s.dialog);
  const hide = useDialogStore((s) => s.hide);

  if (!dialog) return null;

  const press = (button: DialogButton) => {
    // 콜백 전에 닫는다 — 콜백이 또 다른 다이얼로그를 열 수 있다
    hide();
    button.onPress?.();
  };

  // 취소는 항상 마지막에 두어 파괴적 액션과 인접하지 않게 한다
  const buttons = [...dialog.buttons].sort(
    (a, b) => (a.style === 'cancel' ? 1 : 0) - (b.style === 'cancel' ? 1 : 0),
  );

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={hide}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

          <View style={styles.actions}>
            {buttons.map((b, i) => (
              <Pressable
                key={`${b.text ?? i}`}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
                onPress={() => press(b)}
                accessibilityRole="button"
              >
                <Text style={[styles.buttonText, { color: textColor(b.style) }]}>
                  {b.text ?? '확인'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  actions: { marginTop: spacing.md },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  buttonText: { fontSize: fontSize.body, fontWeight: '800' },
}));
