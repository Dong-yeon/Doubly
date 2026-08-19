/**
 * 메시지 길게 누르기 액션 시트 — 예전엔 OS Alert 로 텍스트 목록만 떴다.
 * 길게 누르라는 힌트가 화면 어디에도 없어 발견성이 낮았고, 리액션은 여기서
 * 고르지 않고 별도 전체 이모지 피커를 또 열어야 했다. 지금은 빠른 리액션 +
 * 액션 목록을 한 시트에 담아 대화 흐름을 끊지 않는다.
 *
 * 빠른 리액션은 여기서 곧장 메시지에 리액션을 남긴다(대화 로그에 새 메시지를
 * 쌓던 예전 "빠른 리액션 바"와 달리 진짜 리액션이다) — ChatRoomScreen.onReact 참고.
 */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';
import { messagePreview } from '../utils/messagePreview';
import type { ChatMessage } from '../types';

const QUICK_REACTIONS = ['💗', '🔥', '💪', '👍', '🎉'];

interface Props {
  /** null 이면 시트를 숨긴다 — visible 을 별도 prop 으로 안 두고 대상 자체로 판단 */
  message: ChatMessage | null;
  mine: boolean;
  /** 내가 보낸 텍스트 메시지만 수정 가능 */
  canEdit: boolean;
  onClose: () => void;
  onQuickReact: (emoji: string) => void;
  onMoreEmoji: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function MessageActionSheet({
  message,
  mine,
  canEdit,
  onClose,
  onQuickReact,
  onMoreEmoji,
  onReply,
  onEdit,
  onDelete,
}: Props) {
  const visible = message !== null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* onPress 로 탭을 흡수한다 — 없으면 시트 빈 곳 터치가 배경으로 새어나가 닫힌다 */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          {message ? (
            <Text style={styles.preview} numberOfLines={1}>
              {messagePreview(message.messageType, message.content)}
            </Text>
          ) : null}

          <View style={styles.quickRow}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
                onPress={() => onQuickReact(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`${emoji} 리액션`}
              >
                <Text style={styles.quickEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              style={({ pressed }) => [styles.quickBtn, pressed && styles.quickBtnPressed]}
              onPress={onMoreEmoji}
              accessibilityRole="button"
              accessibilityLabel="다른 이모지로 리액션"
            >
              <MaterialCommunityIcons name="dots-horizontal" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.divider} />

          <ActionRow icon="reply-outline" label="답장하기" onPress={onReply} />
          {canEdit ? <ActionRow icon="pencil-outline" label="수정하기" onPress={onEdit} /> : null}
          {mine ? (
            <ActionRow icon="delete-outline" label="삭제하기" destructive onPress={onDelete} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={destructive ? colors.danger : colors.textPrimary}
      />
      <Text style={[styles.actionLabel, destructive && styles.actionLabelDestructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  preview: {
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quickBtn: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtnPressed: { transform: [{ scale: 0.88 }], backgroundColor: colors.primarySoft },
  quickEmoji: { fontSize: 22 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  actionRowPressed: { backgroundColor: colors.surfaceAlt },
  actionLabel: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
  actionLabelDestructive: { color: colors.danger },
}));
