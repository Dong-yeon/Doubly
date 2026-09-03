/**
 * 채팅방 "더보기" 시트 — 사진 모아보기 · 저장한 대화.
 *
 * 헤더에 아이콘을 하나씩 늘리면(검색·통화·영상통화가 이미 3개) 좁은 기기에서
 * 겹친다(HomeScreen QuickActions 폭 예산 주석과 같은 문제). 자주 안 쓰는 두 항목을
 * "⋮" 하나로 묶는다 — MessageActionSheet 와 같은 바텀시트 구조.
 */
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPhotos: () => void;
  onSaved: () => void;
}

export function ChatMoreMenuSheet({ visible, onClose, onPhotos, onSaved }: Props) {
  const go = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Row icon="image-multiple-outline" label="사진 모아보기" onPress={() => go(onPhotos)} />
          <Row icon="bookmark-outline" label="저장한 대화" onPress={() => go(onSaved)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <MaterialCommunityIcons name={icon} size={20} color={colors.textPrimary} />
      <Text style={styles.label}>{label}</Text>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.touchTarget,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.surfaceAlt },
  label: { fontSize: fontSize.body, color: colors.textPrimary, fontWeight: '600' },
}));
