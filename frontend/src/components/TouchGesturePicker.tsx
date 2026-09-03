/**
 * 가상 터치 제스처 선택 시트 — Obimy 벤치마킹(PLAN.md "가상 터치" 참고).
 *
 * EmojiPicker 와 같은 바텀시트 구조. 프리미엄 제스처(포옹·뽀뽀)를 FREE 사용자가 누르면
 * 전송하지 않고 업그레이드 시트를 연다 — LockedCard 와 같은 패턴("눌렀을 때만" 안내).
 * 서버(ChatService.requireValidTouch)도 같은 규칙으로 한 번 더 막는다 — 여기는 우회 방지가
 * 아니라 UX(굳이 보냈다가 거부당하지 않게).
 */
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { TOUCH_GESTURES } from '../constants/touchGestures';
import { usePlanStore } from '../store/planStore';
import type { TouchGestureCode } from '../types';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (code: TouchGestureCode) => void;
}

export function TouchGesturePicker({ visible, onClose, onSelect }: Props) {
  const can = usePlanStore((s) => s.can);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);

  const onPress = (code: TouchGestureCode, premium: boolean, label: string) => {
    if (premium && !can('TOUCH_GESTURE_PREMIUM')) {
      showUpgrade(`${label}은(는) PRO에서 보낼 수 있어요.`);
      return;
    }
    onSelect(code);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>터치 보내기</Text>
          <Text style={styles.desc}>상대 폰이 바로 진동해요 — 앱을 열고 있을 때만요.</Text>

          <View style={styles.grid}>
            {TOUCH_GESTURES.map((g) => {
              const locked = g.premium && !can('TOUCH_GESTURE_PREMIUM');
              return (
                <Pressable
                  key={g.code}
                  style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                  onPress={() => onPress(g.code, g.premium, g.label)}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.label} 보내기${locked ? ' — PRO 기능' : ''}`}
                >
                  {locked ? (
                    <View style={styles.lockBadge}>
                      <Text style={styles.lockBadgeText}>PRO</Text>
                    </View>
                  ) : null}
                  <Text style={styles.emoji}>{g.emoji}</Text>
                  <Text style={styles.label}>{g.label}</Text>
                </Pressable>
              );
            })}
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
  desc: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  cell: {
    width: '18%',
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
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.togetherBg,
  },
  lockBadgeText: { color: colors.together, fontSize: 8, fontWeight: '800' },
}));
