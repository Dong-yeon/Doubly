/**
 * 선택 칩 — 끼니·카테고리·상태·필터처럼 "여럿 중 고르는" UI 공용.
 *
 * <p><b>왜 모았나</b>: 같은 역할의 칩이 화면마다 손으로 만들어져
 * 높이가 30~36px(권장 44 미달)로 제각각이었고, 모서리도 알약과 각진 형태가 섞였다.
 * 활성 배경을 하드코딩(#E6F7F2 등)한 곳은 다크모드에서 밝은 덩어리로 남았다.
 *
 * <p>터치 타깃 44 는 여기서 보장하므로 호출부는 라벨과 선택 여부만 넘기면 된다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  /** 가로를 균등 분할해 채울 때 (한 줄에 나란히 놓는 칩) */
  fill?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, onPress, fill, disabled, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        fill ? styles.fill : null,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text style={[styles.text, selected && styles.textSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  chip: {
    minHeight: 44, // iOS HIG 44pt / Android 48dp — 칩이 가장 자주 미달하던 지점
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  selected: { backgroundColor: colors.primaryBg, borderColor: colors.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  text: { fontSize: fontSize.body, color: colors.textSecondary, fontWeight: '600' },
  textSelected: { color: colors.primary, fontWeight: '800' },
}));
