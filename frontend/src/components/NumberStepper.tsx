/**
 * 숫자 입력 + 증감 버튼 — 세트·횟수·무게처럼 <b>작은 폭으로 자주 조정하는</b> 값에 쓴다.
 *
 * <p><b>왜 필요한가</b>: 운동 기록은 종목마다 세트·횟수·무게를 손으로 타이핑해야 했다.
 * 종목 하나에 필드 3개, 다섯 종목이면 열다섯 번이다. 실제로는 "지난번보다 2.5kg 더"
 * 같은 미세 조정이 대부분이라, 눌러서 올리는 편이 훨씬 빠르다.
 *
 * <p>키보드 입력도 그대로 열어둔다 — 값이 크게 달라질 때는 타이핑이 빠르다.
 * 증감 버튼은 44×44 로 잡아 반복 탭에도 정확도가 떨어지지 않게 한다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** 한 번 누를 때 증감량 (무게는 2.5 처럼 소수도 쓴다) */
  step?: number;
  /** 소수 허용 여부 — 무게만 true */
  decimal?: boolean;
  placeholder?: string;
  min?: number;
}

export function NumberStepper({
  label,
  value,
  onChange,
  step = 1,
  decimal = false,
  placeholder,
  min = 0,
}: Props) {
  const bump = (delta: number) => {
    const current = Number(value) || 0;
    const next = Math.max(min, current + delta);
    // 부동소수 오차로 "42.500000000000004" 가 되는 것을 막는다
    onChange(decimal ? String(Number(next.toFixed(2))) : String(Math.round(next)));
  };

  const sanitize = (t: string) => onChange(decimal ? t.replace(/[^0-9.]/g, '') : t.replace(/[^0-9]/g, ''));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => bump(-step)}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${step} 줄이기`}
        >
          <MaterialCommunityIcons name="minus" size={18} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={sanitize}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          textAlign="center"
          accessibilityLabel={label}
        />
        <Pressable
          onPress={() => bump(step)}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${label} ${step} 늘리기`}
        >
          <MaterialCommunityIcons name="plus" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrap: { flex: 1 },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  btn: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.5 },
  input: {
    flex: 1,
    height: 44,
    fontSize: fontSize.subtitle,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingHorizontal: 0,
  },
}));
