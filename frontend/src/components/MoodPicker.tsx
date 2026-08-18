/**
 * 무드 선택 시트 — Obimy 벤치마킹(PLAN.md "무드 상태" 참고).
 *
 * TouchGesturePicker와 같은 구조. 게이팅이 없다 — 기본 세트는 처음부터 전부 무료라
 * usePlanStore 를 참조하지 않는다(TouchGesturePicker와의 유일한 차이).
 */
import React, { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { MOOD_EMOJIS } from '../constants/moodEmojis';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string, message?: string) => void;
}

export function MoodPicker({ visible, onClose, onSelect }: Props) {
  const [message, setMessage] = useState('');

  const close = () => {
    setMessage('');
    onClose();
  };

  const onPress = (emoji: string) => {
    onSelect(emoji, message.trim() || undefined);
    close();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>지금 기분</Text>
          <Text style={styles.desc}>이모지 하나로 답장 없이 알려줘요.</Text>

          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="짧은 메모 (선택, 20자)"
            placeholderTextColor={colors.textTertiary}
            maxLength={20}
          />

          <View style={styles.grid}>
            {MOOD_EMOJIS.map((m) => (
              <Pressable
                key={m.emoji}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => onPress(m.emoji)}
                accessibilityRole="button"
                accessibilityLabel={`${m.label} 무드로 남기기`}
              >
                <Text style={styles.emoji}>{m.emoji}</Text>
                <Text style={styles.label}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.sm },
  messageInput: {
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.caption,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '22%',
    minWidth: 60,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cellPressed: { backgroundColor: colors.primarySoft, transform: [{ scale: 0.94 }] },
  emoji: { fontSize: 26, lineHeight: 30 },
  label: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
}));
