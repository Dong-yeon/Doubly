/** 화면 상단에 잠깐 떴다 사라지는 토스트 */
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../store/toastStore';
import { colors, fontSize, radius, shadow, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

/*
 * 토스트 배경 — 글씨가 항상 흰색이므로 배경은 <b>두 테마 모두에서 어두워야</b> 한다.
 * 예전 success 는 colors.textPrimary 였는데, 다크모드에서 이 값이 밝은 색(#F2F1F7)으로
 * 뒤집혀 흰 글씨가 그대로 사라졌다. 세 종류 모두 테마와 무관하게 대비가 유지되는
 * 기능색을 쓴다.
 */
/* 렌더 시점에 현재 팔레트를 읽는다 — 객체로 굳히면 테마 전환을 따라오지 못한다 */
const bgOf = (kind: 'success' | 'error' | 'info'): string =>
  ({ success: colors.success, error: colors.danger, info: colors.primary })[kind];

export function Toast() {
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    /*
     * 되묻는 토스트는 오래 띄운다 — 2.2초는 읽고 판단해서 손가락을 올리기에 짧다.
     * 그냥 알리기만 하는 토스트를 같이 늘리면 화면을 가리는 시간만 길어지므로 갈라 둔다.
     */
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide());
    }, toast.action ? 5000 : 2200);
    return () => clearTimeout(t);
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;

  return (
    <Animated.View
      /*
       * 되묻기 버튼이 있을 때만 터치를 받는다. box-none 이라 토스트 몸통은 여전히
       * 통과시키고 버튼만 잡는다 — 알림용 토스트가 화면 상단 터치를 먹던 문제가
       * 생기지 않는다(원래 none 이었던 이유).
       */
      pointerEvents={toast.action ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        /*
         * 웹에서는 position:fixed 로 띄운다. absolute 면 모달로 표시되는 화면
         * (식단 기록 등)의 스택 컨텍스트에 갇혀 토스트가 뒤로 가려질 수 있다.
         * 네이티브에는 fixed 가 없으므로 웹에서만 적용한다.
         */
        Platform.OS === 'web' ? ({ position: 'fixed', zIndex: 99999 } as object) : null,
        { top: insets.top + spacing.sm, backgroundColor: bgOf(toast.type) },
        shadow.md,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <View style={styles.row}>
        <Text style={styles.text}>{toast.message}</Text>
        {toast.action ? (
          <Pressable
            onPress={() => {
              // 먼저 닫는다 — 핸들러가 또 토스트를 띄우는 경우(대부분)에 새 토스트가
              // 곧바로 덮이지 않도록. 스토어는 슬롯이 하나뿐이다.
              hide();
              toast.action?.onPress();
            }}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Text style={styles.actionText}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    zIndex: 999,
  },
  text: { color: colors.white, fontSize: fontSize.body, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* 같은 알약 안의 버튼 — 배경이 기능색이라 흰 반투명으로 얹어야 어느 색 위에서도 읽힌다 */
  action: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actionPressed: { backgroundColor: 'rgba(255,255,255,0.38)' },
  actionText: { color: colors.white, fontSize: fontSize.caption, fontWeight: '800' },
}));
