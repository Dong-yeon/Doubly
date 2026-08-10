import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, fontSize, radius, shadow, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props extends PressableProps {
  title: string;
  loading?: boolean;
  /** primary: 브릭 로즈 채움 · secondary: 화이트+보더 · ghost: 아웃라인 · soft: 연한 톤(기존 유지) */
  variant?: 'primary' | 'secondary' | 'ghost' | 'soft';
  size?: 'sm' | 'md' | 'lg';
  /** 텍스트 왼쪽 아이콘 슬롯 */
  leftIcon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  title,
  loading,
  variant = 'primary',
  size = 'lg',
  leftIcon,
  style,
  disabled,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const filled = variant === 'primary';
  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[size],
        styles[variant],
        filled && shadow.sm,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={filled ? colors.white : colors.primary} />
      ) : (
        <View style={styles.content}>
          {leftIcon ? <View style={styles.icon}>{leftIcon}</View> : null}
          <Text style={[styles.text, size === 'sm' ? styles.textSm : null, textStyle(variant)]}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const textStyle = (variant: Props['variant']) => {
  switch (variant) {
    case 'primary':
      return { color: colors.white };
    case 'soft':
      return { color: colors.primary };
    default:
      // secondary / ghost
      return { color: variant === 'ghost' ? colors.primary : colors.textPrimary };
  }
};

const styles = themedStyles((colors) => ({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { alignItems: 'center', justifyContent: 'center' },
  sm: { height: 38, paddingHorizontal: spacing.md },
  md: { height: 46 },
  lg: { height: 54 },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  soft: { backgroundColor: colors.primaryBg },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  disabled: { opacity: 0.45 },
  text: { fontFamily: fonts.semiBold, fontSize: fontSize.subtitle, fontWeight: '700', letterSpacing: 0.2 },
  textSm: { fontSize: fontSize.body },
}));
