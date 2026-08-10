import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

interface Props extends TextInputProps {
  label?: string;
  errorText?: string;
}

export function TextField({ label, errorText, style, secureTextEntry, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = !!secureTextEntry;
  const isMultiline = !!rest.multiline;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={isPassword && !reveal}
          // 여러 줄 입력은 첫 줄이 위에서 시작해야 한다 (안드로이드 기본은 세로 가운데)
          textAlignVertical={isMultiline ? 'top' : undefined}
          style={[
            styles.input,
            isMultiline && styles.inputMultiline,
            isPassword && styles.inputWithToggle,
            focused && styles.inputFocused,
            !!errorText && styles.inputError,
            style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword ? (
          <Pressable style={styles.eye} onPress={() => setReveal((v) => !v)} hitSlop={8}>
            <MaterialCommunityIcons
              name={reveal ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>
        ) : null}
      </View>
      {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  wrapper: { marginBottom: spacing.md },
  // 예전엔 marginLeft: spacing.xs 로 라벨만 4px 들여써서 입력 박스 테두리와
  // 어긋났다(라벨 28 / 박스 24 / 입력 텍스트 41.5, 세 개의 다른 시작선). 라벨을
  // 박스와 같은 시작선에 맞춘다.
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    fontWeight: '700',
  },
  inputRow: { justifyContent: 'center' },
  input: {
    height: 54,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.subtitle,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
  },
  /*
   * 여러 줄 입력 — 고정 height(54) 를 그대로 두면 한 줄 높이에 갇혀 글이 잘리고
   * 세로 가운데 정렬이라 깨져 보인다. 높이를 풀고 최소 높이만 준다.
   */
  inputMultiline: {
    height: undefined,
    minHeight: 108,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    lineHeight: 22,
  },
  inputWithToggle: { paddingRight: 48 },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger, backgroundColor: colors.surface },
  eye: { position: 'absolute', right: spacing.sm, height: layout.touchTarget, width: layout.touchTarget, alignItems: 'center', justifyContent: 'center' },
  eyeText: { fontSize: 18 },
  error: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs },
}));
