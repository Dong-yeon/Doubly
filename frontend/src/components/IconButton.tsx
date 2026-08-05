/**
 * 아이콘 버튼 — 44×44 터치 타깃과 접근성 라벨을 강제한다.
 *
 * <p><b>왜 만들었나</b>: 아이콘·텍스트 링크형 액션이 화면마다 raw `Pressable` 로
 * 만들어지면서 실제 터치 영역이 15~30px 로 떨어진 곳이 많았다(삭제·사진 지우기·
 * 통계 링크·일정 순서 이동 등). 특히 여행 일정의 ▲▼✕ 는 26×18px 로 붙어 있어
 * 순서를 바꾸려다 삭제를 누르기 쉬웠다.
 *
 * <p>아이콘만 있는 버튼은 스크린리더에 읽을 것이 없으므로 `label` 을 필수로 받는다.
 */
import React from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../constants/theme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  icon: IconName;
  /** 접근성 라벨 — 아이콘 버튼은 읽을 텍스트가 없어 필수 */
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = 22,
  color = colors.textSecondary,
  disabled,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <MaterialCommunityIcons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
