/**
 * "문구 넣기" 시트 — 캐릭터 스티커를 길게 누르면 뜬다(짧게 누르면 예전처럼 바로 전송).
 *
 * <p>미리보기는 말풍선과 같은 {@link TextSticker} 를 쓴다 — 보낸 뒤 모양이 달라지면 미리보기가 거짓말이 된다.
 * 문구는 1~12자, 줄바꿈 없음(서버와 같은 규칙, utils/textSticker.ts).
 *
 * <p>레이아웃은 ScheduleMessageSheet 와 같다(Modal + KeyboardAvoidingView) — 입력창이 있는 하단 시트라
 * 공용 Sheet 로는 키보드가 입력창을 덮는다.
 */
import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { TextSticker } from './TextSticker';
import {
  TEXT_STICKER_MAX_LENGTH,
  clampTextStickerText,
  isValidTextStickerText,
  textStickerLength,
} from '../../utils/textSticker';
import { withJosa } from '../../utils/format';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { onColor } from '../../theme/onColor';
import { themedStyles } from '../../theme/themedStyles';

interface Props {
  /** 문구를 얹을 캐릭터 스티커 */
  stickerCode: string;
  /** 처음 채워 둘 문구(추천 막대에서 열면 입력 중이던 문장) — 12자를 넘으면 잘라서 넣는다 */
  initialText?: string;
  /** 빠른 문구 "{이름}아/야 사랑해" — 없으면 그 칩을 뺀다 */
  partnerName?: string | null;
  onClose: () => void;
  onSend: (stickerCode: string, text: string) => void;
}

export function TextStickerSheet({ stickerCode, initialText = '', partnerName, onClose, onSend }: Props) {
  /*
   * 호출부는 열 때만 이 시트를 마운트한다 — 그래서 처음 문구를 초기값으로만 받으면 된다.
   * 지난번에 쓰다 만 글이 다른 스티커에 남아 있지 않다.
   */
  const [text, setText] = useState(() => clampTextStickerText(initialText));

  const quick = useMemo(() => {
    const name = partnerName?.trim();
    const chips = ['보고 싶어', '잘 자', '좋은 아침', '고마워', '미안해'];
    // 이름을 붙이면 12자를 넘을 수 있다 — 넘는 칩은 누를 수 없는 칩이 되므로 뺀다
    const named = name ? `${withJosa(name, '아', '야')} 사랑해` : null;
    return named && textStickerLength(named) <= TEXT_STICKER_MAX_LENGTH ? [named, ...chips] : chips;
  }, [partnerName]);

  const length = textStickerLength(text.trim());
  const canSend = isValidTextStickerText(text);

  const submit = () => {
    if (!canSend) return;
    onSend(stickerCode, text.trim());
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="닫기" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>문구 넣기</Text>

          <View style={styles.preview}>
            <TextSticker stickerCode={stickerCode} text={text.trim() || ' '} />
          </View>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="스티커에 넣을 말"
              placeholderTextColor={colors.textTertiary}
              value={text}
              // 줄바꿈은 받지 않는다 — 붙여넣은 글의 줄바꿈도 공백으로 바꿔 12자에서 자른다
              onChangeText={(v) => setText(clampTextStickerText(v))}
              onSubmitEditing={submit}
              returnKeyType="send"
              autoFocus
              accessibilityLabel="스티커 문구"
            />
            <Text style={[styles.counter, length > TEXT_STICKER_MAX_LENGTH && styles.counterOver]}>
              {length}/{TEXT_STICKER_MAX_LENGTH}
            </Text>
          </View>

          <View style={styles.chipRow}>
            {quick.map((q) => (
              <Pressable
                key={q}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                onPress={() => setText(q)}
                accessibilityRole="button"
                accessibilityLabel={`${q} 넣기`}
              >
                <Text style={styles.chipText}>{q}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={({ pressed }) => [styles.submitBtn, !canSend && styles.submitBtnDisabled, pressed && styles.chipPressed]}
            onPress={submit}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="문구 스티커 보내기"
            accessibilityState={{ disabled: !canSend }}
          >
            <Text style={styles.submitText}>보내기</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles((colors) => ({
  backdrop: { flex: 1, backgroundColor: colors.backdrop, justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center' },
  title: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  // 스티커는 배경이 투명하다 — 채팅 화면처럼 말풍선 없이 판 위에 그대로 올린다
  preview: {
    alignSelf: 'center',
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: fontSize.body,
    color: colors.textPrimary,
  },
  counter: { fontSize: fontSize.caption, color: colors.textSecondary, minWidth: 40, textAlign: 'right' },
  counterOver: { color: colors.danger },
  chipRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  submitBtn: {
    marginTop: spacing.xs,
    backgroundColor: colors.primaryFill,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { fontSize: fontSize.body, fontWeight: '800', color: onColor(colors.primaryFill) },
}));
