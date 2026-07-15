import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface Props extends TextInputProps {
  label?: string;
  errorText?: string;
}

export function TextField({ label, errorText, style, secureTextEntry, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);
  const isPassword = !!secureTextEntry;

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.inputRow}>
        <TextInput
          placeholderTextColor={colors.textTertiary}
          secureTextEntry={isPassword && !reveal}
          style={[
            styles.input,
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

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.md },
  label: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
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
  inputWithToggle: { paddingRight: 48 },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputError: { borderColor: colors.danger, backgroundColor: colors.surface },
  eye: { position: 'absolute', right: spacing.sm, height: 40, width: 40, alignItems: 'center', justifyContent: 'center' },
  eyeText: { fontSize: 18 },
  error: { color: colors.danger, fontSize: fontSize.caption, marginTop: spacing.xs, marginLeft: spacing.xs },
});
