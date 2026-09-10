/**
 * 무드 선택 시트 — Obimy 벤치마킹(PLAN.md "무드 상태" 참고).
 *
 * EmojiPicker 의 시즌 스티커 게이팅과 같은 구조·같은 규칙이다. 기본 12종은 전부 무료이고,
 * 확장 무드팩만 PRO 다(`Feature.PREMIUM_STICKER` — 스티커와 같은 게이트로 판정한다).
 * 서버(MoodService)도 같은 규칙으로 한 번 더 막는다 — 여기는 우회 방지가 아니라
 * UX(굳이 보냈다가 거부당하지 않게).
 *
 * <p><b>우리 이모지는 "내 얼굴 최신 한 벌"만 올린다</b>(설계 메모 §7·§18). 커플이 여러 벌을
 * 만들 수 있어서(PRO 월 5세트) 전부 올리면 최대 30장이 되는데, 이 파일의 12종 원칙 자체가
 * "처음부터 다 만들면 선택 마비만 생긴다"(`moodEmojis.ts`)에서 나왔다. 두 가지로 줄인다 —
 * ① 무드는 "내 기분"이므로 <b>내 얼굴</b>(subjectUserId === 나)만, ② 그중 <b>최신 한 벌</b>만.
 * 그래야 세트를 몇 벌 만들어도 여기 개수는 한 벌치(감정 종류 수)로 고정된다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { MOOD_EMOJIS, PREMIUM_MOOD_EMOJIS } from '../constants/moodEmojis';
import { COUPLE_EMOJI_EMOTIONS } from '../constants/coupleEmojiEmotions';
import { usePlanStore } from '../store/planStore';
import { useCoupleEmojiStore } from '../store/coupleEmojiStore';
import { useAuthStore } from '../store/authStore';
import { colors, fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';
import type { MoodChoice } from '../api/mood';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (choice: MoodChoice, message?: string) => void;
}

export function MoodPicker({ visible, onClose, onSelect }: Props) {
  const [message, setMessage] = useState('');
  const can = usePlanStore((s) => s.can);
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const premiumAllowed = can('PREMIUM_STICKER');

  const myId = useAuthStore((s) => s.user?.id);
  const coupleEmojis = useCoupleEmojiStore((s) => s.emojis);
  const loadCoupleEmojis = useCoupleEmojiStore((s) => s.load);

  // 시트를 열 때 목록을 확인한다(캐시가 있으면 요청은 안 나간다 — 스토어의 load 규칙).
  useEffect(() => {
    // 실패해도 시트는 유니코드 무드로 그대로 쓸 수 있다 — 오프라인에서 unhandled rejection 을 내지 않는다
    if (visible) loadCoupleEmojis().catch(() => undefined);
  }, [visible, loadCoupleEmojis]);

  /** 내 얼굴 최신 한 벌 — 파일 상단 주석의 두 가지 축소 규칙 */
  const myLatestSet = useMemo(() => {
    if (!myId) return [];
    // 목록은 서버가 최신순(id desc)으로 준다 → 처음 만나는 내 얼굴의 batchId 가 최신 세트다
    const mine = coupleEmojis.filter((e) => e.subjectUserId === myId);
    const latestBatchId = mine[0]?.batchId;
    if (!latestBatchId) return [];
    const set = mine.filter((e) => e.batchId === latestBatchId);
    // 감정 정해진 순서로 — 목록 순서(id desc)는 생성 역순이라 사람이 읽는 순서와 다르다
    return COUPLE_EMOJI_EMOTIONS.map((def) => set.find((e) => e.emotion === def.key)).filter(
      (e): e is (typeof set)[number] => !!e,
    );
  }, [coupleEmojis, myId]);
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

  const onPress = (choice: MoodChoice, locked: boolean, label: string) => {
    if (locked) {
      showUpgrade(`${label} 무드는 PRO에서 쓸 수 있어요.`);
      return;
    }
    onSelect(choice, message.trim() || undefined);
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
          <ScrollView style={{ maxHeight: gridMaxHeight }}>
            {/*
              우리 이모지가 있을 때만 섹션이 나타난다. 없을 때 "만들기" 안내를 넣지 않은 건
              생성 진입점이 채팅 트레이 한 곳이어서다 — 여기에 또 두면 같은 기능의 입구가
              둘로 갈린다(§18 "남은 것"에 후속으로 적어 뒀다).
            */}
            {myLatestSet.length > 0 ? (
              <>
                <Text style={styles.sectionTitle}>우리 이모지</Text>
                <View style={styles.grid}>
                  {myLatestSet.map((e) => (
                    <Pressable
                      key={e.id}
                      style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                      onPress={() => onPress({ coupleEmojiId: e.id }, false, e.label)}
                      accessibilityRole="button"
                      accessibilityLabel={`내 얼굴 ${e.label} 무드로 남기기`}
                    >
                      <Image source={{ uri: e.imageUrl }} style={styles.cellImage} resizeMode="contain" />
                      <Text style={styles.label}>{e.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.sectionTitle}>기본</Text>
              </>
            ) : null}
            <View style={styles.grid}>
              {MOOD_EMOJIS.map((m) => (
                <Pressable
                  key={m.emoji}
                  style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                  onPress={() => onPress({ emoji: m.emoji }, false, m.label)}
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
                  onPress={() => onPress({ emoji: m.emoji }, !premiumAllowed, m.label)}
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
            </View>
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
  sectionTitle: {
    fontSize: fontSize.caption,
    fontWeight: '800',
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
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
  /** 우리 이모지 — 유니코드 셀의 glyph(26px)보다 키운다. 얼굴이 알아보여야 고를 수 있다 */
  cellImage: { width: 38, height: 38 },
  label: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },
}));
