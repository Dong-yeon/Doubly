/**
 * 맞춤법 제안 줄 — 입력창 바로 위에 뜬다.
 *
 * <p><b>고쳐주지 않고 물어본다.</b> 자동으로 글자를 바꾸면 일부러 그렇게 쓴 말까지
 * 건드리게 되고(애칭·말버릇), 무엇보다 내가 안 시킨 수정이 대화에 섞인다.
 * 그래서 누르면 바뀌고, 닫으면 그대로 보낸다.
 *
 * <p>한 번에 하나만 보여준다. 제안 여러 개를 늘어놓으면 입력창을 덮어버리고,
 * 실제로 헷갈리는 건 대개 한 군데다. 고치면 다음 것이 이어서 뜬다.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { SpellSuggestion } from '../utils/koreanSpellCheck';
import { colors, fontSize, radius, spacing } from '../constants/theme';

interface Props {
  suggestion: SpellSuggestion | null;
  /** 남은 제안 수 (1개면 표시하지 않는다) */
  total: number;
  onApply: () => void;
  onDismiss: () => void;
}

export function SpellCheckBar({ suggestion, total, onApply, onDismiss }: Props) {
  if (!suggestion) return null;

  return (
    <View style={styles.bar}>
      <MaterialCommunityIcons name="spellcheck" size={17} color={colors.primary} />

      <Pressable style={styles.body} onPress={onApply} accessibilityRole="button">
        <Text style={styles.fix} numberOfLines={1}>
          <Text style={styles.wrong}>{suggestion.wrong}</Text>
          <Text style={styles.arrow}> → </Text>
          <Text style={styles.right}>{suggestion.right}</Text>
          {total > 1 ? <Text style={styles.count}>  외 {total - 1}개</Text> : null}
        </Text>
        <Text style={styles.reason} numberOfLines={1}>
          {suggestion.reason}
        </Text>
      </Pressable>

      <Pressable style={styles.apply} onPress={onApply} accessibilityRole="button">
        <Text style={styles.applyText}>바꾸기</Text>
      </Pressable>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="맞춤법 제안 닫기"
      >
        <MaterialCommunityIcons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  body: { flex: 1 },
  fix: { fontSize: fontSize.body },
  wrong: { color: colors.danger, fontWeight: '700', textDecorationLine: 'line-through' },
  arrow: { color: colors.textSecondary },
  right: { color: colors.textPrimary, fontWeight: '800' },
  count: { color: colors.textSecondary, fontSize: fontSize.caption },
  reason: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  apply: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    minHeight: 32,
    justifyContent: 'center',
  },
  // 배경이 colors.primary — 라이트/다크 모두 흰 글씨가 대비를 만족한다
  applyText: { color: colors.white, fontWeight: '800', fontSize: fontSize.caption },
});
