/** 체크박스 — 약관 동의 등. 터치 타깃 44pt 이상 유지(a11y) */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** 우측 보조 액션 — 예: "보기" 링크 */
  trailing?: React.ReactNode;
  /** 강조 표시 (필수 항목) */
  emphasized?: boolean;
}

export function Checkbox({ checked, onChange, label, trailing, emphasized }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        style={({ pressed }) => [styles.hit, pressed && styles.pressed]}
        onPress={() => onChange(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
      >
        <View style={[styles.box, checked && styles.boxChecked]}>
          {checked ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <Text style={[styles.label, emphasized && styles.labelEmphasized]} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
      {trailing}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center' },
  hit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  boxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  check: { color: '#FFFFFF', fontSize: fontSize.caption, fontWeight: '800' },
  label: { flex: 1, fontSize: fontSize.body, color: colors.textSecondary },
  labelEmphasized: { color: colors.textPrimary, fontWeight: '600' },
}));
