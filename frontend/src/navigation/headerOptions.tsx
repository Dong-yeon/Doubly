/**
 * 스택 헤더 공통 옵션 — 네 개 탭 스택이 같은 헤더를 쓴다.
 *
 * <b>뒤로가기 버튼을 직접 그리는 이유</b>: react-navigation 기본 뒤로가기 아이콘은
 * 검은 PNG 를 `tintColor` 로 물들이는 방식인데, 웹(react-native-web)에서는 이 틴트가
 * 적용되지 않아 <b>다크 배경 위에 검은 화살표</b>가 되어 보이지 않았다
 * (눌리기는 해서 "안 보이는데 동작한다"는 증상). 아이콘 폰트로 직접 그리면
 * 색을 우리가 통제하므로 라이트·다크 어디서나 보인다.
 *
 * 모달로 여는 화면은 `presentation: 'modal'` 만 주면 뒤로가기 버튼 자체가 없어
 * 웹·안드로이드에서 빠져나갈 방법이 없다 — 그래서 닫기(X) 버튼을 붙인다.
 */
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function HeaderIconButton({ icon, label }: { icon: IconName; label: string }) {
  const navigation = useNavigation();
  // 돌아갈 곳이 없으면(스택 첫 화면) 버튼을 그리지 않는다
  if (!navigation.canGoBack()) return null;
  return (
    <Pressable
      onPress={() => navigation.goBack()}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={26} color={colors.textPrimary} />
    </Pressable>
  );
}

/**
 * 스택 네비게이터 공통 `screenOptions`.
 *
 * `headerBackVisible: false` 가 필요한 이유: 이걸 끄지 않으면 네이티브 스택이 기본
 * 뒤로가기 버튼을 함께 그리고, 그게 우리 버튼보다 앞에 놓여 <b>보이지 않는(검은) 화살표</b>가
 * 그대로 남는다. 기본 버튼을 끄고 우리 아이콘만 쓴다.
 */
export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerShadowVisible: false,
  headerBackVisible: false,
  headerLeft: () => <HeaderIconButton icon="arrow-left" label="뒤로 가기" />,
  /*
   * iOS 스와이프백 보장 — 커스텀 headerLeft 는 UIKit 의
   * interactivePopGestureRecognizer 를 꺼뜨리는 고전 패턴이다.
   * fullScreenGestureEnabled 는 react-native-screens 자체 팬 제스처를 쓰므로
   * 커스텀 버튼과 무관하게 화면 어디서든 스와이프백이 동작한다.
   * (웹에서 기본 뒤로가기 아이콘이 안 보이는 문제 때문에 커스텀 버튼은 유지)
   */
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
} as const;

/** 모달 화면 옵션 — `options={{ title: '...', ...modalOptions }}` 로 펼쳐 쓴다. */
export const modalOptions = {
  presentation: 'modal',
  headerBackVisible: false,
  headerLeft: () => <HeaderIconButton icon="close" label="닫기" />,
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
