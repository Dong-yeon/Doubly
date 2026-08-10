/**
 * 날짜 입력 — 타이핑 대신 달력에서 고른다. {@link TextField} 와 같은 모양이지만
 * 누르면 {@link DatePickerSheet} 가 열린다.
 *
 * <p>손으로 치던 시절에는 "2024-2-14"(자릿수 부족), "2024.02.14"(구분자 다름),
 * "2024-02-30"(없는 날짜) 같은 값이 전부 저장 버튼을 누른 뒤에야 걸렸다.
 * 고르게 하면 애초에 잘못된 값이 만들어지지 않고, min/max 로 "종료일은 시작일 이후"
 * 같은 규칙도 입력 단계에서 지킬 수 있다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { pickDate } from '../store/datePickerStore';
import { formatDateCompact, formatDateLabel } from '../utils/date';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  label?: string;
  /** YYYY-MM-DD. 빈 문자열이면 미선택 */
  value: string;
  onChange: (value: string) => void;
  /** 미선택일 때 보여줄 문구 */
  placeholder?: string;
  /** 선택 가능한 하한/상한 (YYYY-MM-DD, 경계 포함) */
  min?: string;
  max?: string;
  /** 달력 상단 제목 — 없으면 label 을 쓴다 */
  pickerTitle?: string;
  errorText?: string;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = '날짜 선택',
  min,
  max,
  pickerTitle,
  errorText,
}: Props) {
  const open = async () => {
    const picked = await pickDate({
      title: pickerTitle ?? label ?? '날짜 선택',
      value: value || null,
      min,
      max,
    });
    // 취소(null)면 기존 값을 그대로 둔다
    if (picked) onChange(picked);
  };

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={[styles.box, !!errorText && styles.boxError]}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? '날짜'} 선택${value ? `, 현재 ${formatDateLabel(value)}` : ''}`}
      >
        <Text style={[styles.text, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatDateCompact(value) : placeholder}
        </Text>
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.textTertiary} />
      </Pressable>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrapper: { marginBottom: spacing.md },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  // TextField 와 같은 치수·색을 쓴다 — 한 폼 안에서 줄이 어긋나 보이면 안 된다
  box: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  boxError: { borderColor: colors.danger, backgroundColor: colors.surface },
  text: { flex: 1, fontSize: fontSize.subtitle, color: colors.textPrimary },
  placeholder: { color: colors.textTertiary },
  error: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs },
}));
