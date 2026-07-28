/** 화면 상단에 잠깐 떴다 사라지는 토스트 */
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToastStore } from '../store/toastStore';
import { colors, fontSize, radius, shadow, spacing } from '../constants/theme';

/*
 * 토스트 배경 — 글씨가 항상 흰색이므로 배경은 <b>두 테마 모두에서 어두워야</b> 한다.
 * 예전 success 는 colors.textPrimary 였는데, 다크모드에서 이 값이 밝은 색(#F2F1F7)으로
 * 뒤집혀 흰 글씨가 그대로 사라졌다. 세 종류 모두 테마와 무관하게 대비가 유지되는
 * 기능색을 쓴다.
 */
const BG = {
  success: colors.success,
  error: colors.danger,
  info: colors.primary,
};

export function Toast() {
  const toast = useToastStore((s) => s.toast);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!toast) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 7, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => hide());
    }, 2200);
    return () => clearTimeout(t);
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        /*
         * 웹에서는 position:fixed 로 띄운다. absolute 면 모달로 표시되는 화면
         * (식단 기록 등)의 스택 컨텍스트에 갇혀 토스트가 뒤로 가려질 수 있다.
         * 네이티브에는 fixed 가 없으므로 웹에서만 적용한다.
         */
        Platform.OS === 'web' ? ({ position: 'fixed', zIndex: 99999 } as object) : null,
        { top: insets.top + spacing.sm, backgroundColor: BG[toast.type] },
        shadow.md,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
        },
      ]}
    >
      <Text style={styles.text}>{toast.message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '90%',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    zIndex: 999,
  },
  text: { color: colors.white, fontSize: fontSize.body, fontWeight: '700', textAlign: 'center' },
});
