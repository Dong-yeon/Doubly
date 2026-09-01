/**
 * 무드 선택 시트 — Obimy 벤치마킹(PLAN.md "무드 상태" 참고).
 *
 * TouchGesturePicker 와 같은 구조·같은 게이팅 규칙이다. 기본 12종은 전부 무료이고,
 * 확장 무드팩만 PRO 다(`Feature.PREMIUM_STICKER` — 스티커와 같은 게이트로 판정한다).
 * 서버(MoodService)도 같은 규칙으로 한 번 더 막는다 — 여기는 우회 방지가 아니라
 * UX(굳이 보냈다가 거부당하지 않게).
 */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { MOOD_EMOJIS, PREMIUM_MOOD_EMOJIS } from '../constants/moodEmojis';
import { usePlanStore } from '../store/planStore';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (emoji: string, message?: string) => void;
}

export function MoodPicker({ visible, onClose, onSelect }: Props) {
  const [message, setMessage] = useState('');
  const can = usePlanStore((s) => s.can);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const premiumAllowed = can('PREMIUM_STICKER');
  /*
   * 격자 스크롤 높이를 320 으로 고정해뒀더니, 화면이 큰 기기(아이폰 프로맥스 등)에서는
   * 시트가 화면 아래쪽 절반도 못 채우고 그 위로 배경(딤 처리된 화면)만 크게 비어
   * 보였다(실기기 리포트, 2026-09-01). 화면 높이에 비례하게 키워서 큰 화면에서도
   * 시트가 그만큼 커지게 한다 — 작은 화면 보호용으로 하한(320)은 그대로 둔다.
   */
  const { height: windowHeight } = useWindowDimensions();
  const gridMaxHeight = Math.max(320, windowHeight * 0.45);

  const close = () => {
    setMessage('');
    onClose();
  };

  const onPress = (emoji: string, locked: boolean, label: string) => {
    if (locked) {
      showUpgrade(`${label} 무드는 PRO에서 쓸 수 있어요.`);
      return;
    }
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

          {/* 확장팩까지 24종이라 작은 화면에서는 넘친다 — 시트 안에서만 스크롤한다 */}
          <ScrollView style={{ maxHeight: gridMaxHeight }} contentContainerStyle={styles.grid}>
            {MOOD_EMOJIS.map((m) => (
              <Pressable
                key={m.emoji}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => onPress(m.emoji, false, m.label)}
                accessibilityRole="button"
                accessibilityLabel={`${m.label} 무드로 남기기`}
              >
                <Text style={styles.emoji}>{m.emoji}</Text>
                <Text style={styles.label}>{m.label}</Text>
              </Pressable>
            ))}
            {PREMIUM_MOOD_EMOJIS.map((m) => (
              <Pressable
                key={m.emoji}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => onPress(m.emoji, !premiumAllowed, m.label)}
                accessibilityRole="button"
                accessibilityLabel={`${m.label} 무드로 남기기${premiumAllowed ? '' : ' — PRO 기능'}`}
              >
                {!premiumAllowed ? (
                  <View style={styles.lockBadge}>
                    <Text style={styles.lockBadgeText}>PRO</Text>
                  </View>
                ) : null}
                <Text style={styles.emoji}>{m.emoji}</Text>
                <Text style={styles.label}>{m.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
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
  lockBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.togetherBg,
  },
  lockBadgeText: { color: colors.together, fontSize: 8, fontWeight: '800' },
  /*
   * lineHeight 를 fontSize 보다 크게 주면(예전엔 30) iOS 가 그 여유분을 위아래로
   * 고르게 안 나눠서, 셀 안에서 emoji 가 정가운데가 아니라 위쪽으로 쏠려 보였다
   * (실기기 스크린샷 리포트, 2026-09-01 — cell 의 justifyContent:'center' 자체는
   * 정상 동작, glyph 라인 박스 안의 위치가 문제였다). lineHeight 를 fontSize 와
   * 똑같이 맞춰 여유분을 없애면 글자가 자기 박스를 꽉 채워 쏠릴 여지가 없다.
   */
  emoji: { fontSize: 26, lineHeight: 26 },
  label: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
}));
