/**
 * 모달로 여는 화면의 공통 옵션.
 *
 * `presentation: 'modal'` 만 주면 네이티브 스택이 뒤로가기 버튼을 그리지 않는다.
 * iOS 는 아래로 밀어 닫을 수 있지만 **웹·안드로이드에는 닫을 방법이 없어** 갇힌다.
 * 그래서 모달 화면에는 헤더 왼쪽에 닫기(X) 버튼을 항상 붙인다.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';

function ModalCloseButton() {
  const navigation = useNavigation();
  // 돌아갈 곳이 없으면(딥링크 직접 진입 등) 버튼을 숨긴다 — 눌러도 아무 일이 없으니
  if (!navigation.canGoBack()) return null;
  return (
    <Pressable
      onPress={() => navigation.goBack()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="닫기"
    >
      <MaterialCommunityIcons name="close" size={24} color={colors.textPrimary} />
    </Pressable>
  );
}

/** 모달 화면 옵션 — `options={{ title: '...', ...modalOptions }}` 로 펼쳐 쓴다. */
export const modalOptions = {
  presentation: 'modal',
  headerLeft: () => <ModalCloseButton />,
} as const;

const styles = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
  pressed: { opacity: 0.6 },
});
