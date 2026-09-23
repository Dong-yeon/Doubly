/**
 * 채팅방 "더보기" 시트 — 사진 모아보기 · 저장한 대화 · 채팅 배경.
 *
 * 헤더에 아이콘을 하나씩 늘리면(검색·통화·영상통화가 이미 3개) 좁은 기기에서
 * 겹친다(HomeScreen QuickActions 폭 예산 주석과 같은 문제). 자주 안 쓰는 항목들을
 * "⋮" 하나로 묶는다 — MessageActionSheet 와 같은 바텀시트 구조.
 */
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from './Icon';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import { layout } from '../theme/layout';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPhotos: () => void;
  onSaved: () => void;
  onScheduled: () => void;
  onExport: () => void;
  onBackground: () => void;
}

export function ChatMoreMenuSheet({
  visible,
  onClose,
  onPhotos,
  onSaved,
  onScheduled,
  onExport,
  onBackground,
}: Props) {
  /*
   * 시트는 Modal 안이라 화면의 SafeAreaView 밖이다 — 인셋을 직접 받아야 한다.
   * 네 줄일 때는 paddingBottom(32)만으로 안드로이드 3버튼 바를 넘겼는데,
   * "채팅 배경"이 다섯째로 붙으면서 마지막 줄이 바에 잘렸다(2026-09-23 실기기).
   */
  const insets = useSafeAreaInsets();
  const go = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Row icon="image-multiple-outline" label="사진 모아보기" onPress={() => go(onPhotos)} />
          <Row icon="bookmark-outline" label="저장한 대화" onPress={() => go(onSaved)} />
          <Row icon="clock-outline" label="예약된 메시지" onPress={() => go(onScheduled)} />
          <Row icon="export-variant" label="대화 내보내기" onPress={() => go(onExport)} />
          {/* 2026-09-23 에 설정에서 이리로 옮겨 왔다 — 이유는 ChatBackgroundSheet 상단 주석 */}
          <Row icon="palette-outline" label="채팅 배경" onPress={() => go(onBackground)} />
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
