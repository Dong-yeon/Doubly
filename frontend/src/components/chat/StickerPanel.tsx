/**
 * 이모티콘 패널 — 팩 썸네일 스트립 + 한 팩 격자.
 *
 * <p><b>왜 새로 짰나</b>(2026-09-14): 예전엔 위에 텍스트 pill 탭 세 개(이모지 · 이모티콘 ·
 * 우리 이모지)가 있고, 한 탭 안에 팩 여러 개를 세로로 이어 붙인 뒤 중간중간 이름표를
 * 끼웠다. 그래서 (1) 무엇이 들어 있는지는 끝까지 스크롤해야 알 수 있었고 (2) 한 줄
 * 8칸(11.5%)이라 그림 이모티콘이 32px 로 작아 표정이 안 보였다. 비트윈처럼 <b>팩을
 * 썸네일 한 줄로 늘어놓고, 고른 팩만 큼직한 5열 격자로</b> 보여준다 — 세로 스크롤이
 * 줄고, 어떤 캐릭터가 있는지가 첫 화면에서 끝난다.
 *
 * <p>팩 경계는 카탈로그가 이미 갖고 있다 — {@code STICKER_CHARACTERS}(캐릭터별 묶음),
 * {@code STICKER_PACKS} 의 시즌 구분, 움직이는 이모티콘 한 묶음. 여기서 새로 나누지
 * 않고 그대로 가져와 스트립 칸으로 편다. 캐릭터가 늘면 스트립 칸이 저절로 하나 더 생긴다
 * (stickerImages.ts 의 {@code StickerCharacter} 주석과 같은 약속).
 *
 * <p><b>화면에서 떼어낸 이유</b>: ChatRoomScreen 이 이미 2200줄이다. 패널은 자기
 * 상태(고른 팩)만 갖고 나머지는 콜백으로 올려 보내므로, 말풍선 렌더와 얽히지 않는다.
 */
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { MaterialCommunityIcons } from '../Icon';
import { ANIMATED_STICKERS } from '../../constants/animatedStickers';
import { STICKER_CHARACTERS } from '../../constants/stickerImages';
import { STICKER_PACKS } from '../../constants/stickerPacks';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { CoupleEmoji } from '../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** 스트립 칸에 그릴 그림 — 팩 종류마다 갖고 있는 게 다르다(유니코드 · 번들 PNG · 원격 URL) */
type PackThumb =
  | { type: 'emoji'; value: string }
  | { type: 'image'; source: ImageSourcePropType }
  | { type: 'uri'; uri: string }
  | { type: 'icon'; name: IconName };

/** 격자 한 칸 */
type PackItem =
  | { type: 'emoji'; key: string; value: string; label: string }
  /** premium 은 움직이는 이모티콘처럼 <b>한 팩 안에서 칸마다</b> 갈리는 경우에만 true 다 */
  | { type: 'image'; key: string; code: string; label: string; source: ImageSourcePropType; premium: boolean }
  | { type: 'couple'; key: string; emoji: CoupleEmoji };

interface PanelPack {
  key: string;
  label: string;
  thumb: PackThumb;
  /** 팩 전체가 PRO 전용인가 — 스트립에 자물쇠, 격자는 흐리게 */
  premium: boolean;
  /** 움직이는 이모티콘 — 스트립에 재생 배지 */
  animated: boolean;
  items: PackItem[];
}

/** 우리 이모지 팩의 키 — 이 팩을 처음 열 때만 서버에서 받아온다 */
const COUPLE_PACK = 'COUPLE';
/** 기본 이모지 팩의 키 — 이 팩에서만 "더 보기·검색" 줄이 붙는다 */
const EMOJI_PACK = 'BASIC';

/**
 * 기본으로 열리는 팩 — 움직이는 이모티콘.
 *
 * <p>2026-09-07 에 30종이 들어오면서 기본 탭을 이모티콘으로 돌렸던 판단을 그대로 잇는다.
 * 패널을 여는 사람 대부분이 찾는 게 그림이지 유니코드 이모지가 아니다.
 */
const DEFAULT_PACK = 'ANIMATED';

interface Props {
  /** 키보드가 있던 자리를 그대로 이어받는 높이 — 탭을 바꿔도 흔들리지 않아야 한다 */
  height: number;
  premiumAllowed: boolean;
  coupleEmojis: CoupleEmoji[];
  onSendSticker: (code: string, locked: boolean, label: string) => void;
  onSendCoupleEmoji: (emojiId: number) => void;
  /** 길게 누르기 — 무드 노출 토글 · 삭제 */
  onManageCoupleEmoji: (emoji: CoupleEmoji) => void;
  onCreateCoupleEmoji: () => void;
  /** 96종 이모지 피커(카테고리 + 한글 검색) 열기 */
  onOpenEmojiSheet: () => void;
  /** 우리 이모지 팩을 처음 열 때 — 안 쓰는 사람에게 방마다 조회를 붙이지 않는다 */
  onOpenCouplePack: () => void;
}

export function StickerPanel({
  height,
  premiumAllowed,
  coupleEmojis,
  onSendSticker,
  onSendCoupleEmoji,
  onManageCoupleEmoji,
  onCreateCoupleEmoji,
  onOpenEmojiSheet,
  onOpenCouplePack,
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(DEFAULT_PACK);

  const packs = useMemo<PanelPack[]>(() => {
    const basic = STICKER_PACKS.find((p) => p.key === EMOJI_PACK);
    const seasonal = STICKER_PACKS.filter((p) => p.key !== EMOJI_PACK);

    /*
     * 순서 = 손이 가는 순서다. 무료 그림 팩이 앞, PRO 시즌 팩이 뒤.
     * 우리 이모지는 "내 얼굴"이라 그림 팩 바로 뒤에 둔다 — 있는 사람에겐 가장 자주 쓰는 팩이다.
     */
    const list: PanelPack[] = [
      {
        key: 'ANIMATED',
        label: '움직이는 이모티콘',
        thumb: { type: 'image', source: ANIMATED_STICKERS[0].thumb },
        // 무료 6 + PRO 24 가 한 팩 안에 섞여 있다 — 팩 단위 잠금이 아니라 칸 단위다
        premium: false,
        animated: true,
        items: ANIMATED_STICKERS.map((a) => ({
          type: 'image', key: a.code, code: a.code, label: a.label, source: a.thumb, premium: a.premium,
        })),
      },
      // 캐릭터 구획을 그대로 스트립 칸으로 — 카탈로그 순서가 곧 스트립 순서다
      ...STICKER_CHARACTERS.map<PanelPack>((c) => ({
        key: c.key,
        label: c.label,
        thumb: { type: 'image', source: c.stickers[0].source },
        premium: false,
        animated: false,
        items: c.stickers.map((i) => ({
          type: 'image', key: i.code, code: i.code, label: i.label, source: i.source, premium: false,
        })),
      })),
      {
        key: COUPLE_PACK,
        label: '우리 이모지',
        // 아직 한 장도 없으면 그릴 썸네일이 없다 — 아이콘으로 자리를 지킨다(빈 격자 안내와 짝)
        thumb: coupleEmojis[0]
          ? { type: 'uri', uri: coupleEmojis[0].imageUrl }
          : { type: 'icon', name: 'face-woman-shimmer-outline' },
        premium: false,
        animated: false,
        items: coupleEmojis.map((e) => ({ type: 'couple', key: `couple-${e.id}`, emoji: e })),
      },
    ];

    if (basic) {
      list.push({
        key: basic.key,
        label: basic.label,
        thumb: { type: 'emoji', value: basic.stickers[0] },
        premium: false,
        animated: false,
        items: basic.stickers.map((s) => ({ type: 'emoji', key: s, value: s, label: `${basic.label} 스티커` })),
      });
    }
    seasonal.forEach((p) => {
      list.push({
        key: p.key,
        label: p.label,
        thumb: { type: 'emoji', value: p.stickers[0] },
        premium: p.premium,
        animated: false,
        items: p.stickers.map((s) => ({ type: 'emoji', key: s, value: s, label: `${p.label} 스티커` })),
      });
    });
    return list;
  }, [coupleEmojis]);

  const active = packs.find((p) => p.key === activeKey) ?? packs[0];
  const packLocked = active.premium && !premiumAllowed;

  const selectPack = (key: string) => {
    setActiveKey(key);
    if (key === COUPLE_PACK) onOpenCouplePack();
  };

  const renderThumb = (thumb: PackThumb, selected: boolean) => {
    switch (thumb.type) {
      case 'emoji':
        return <Text style={styles.stripEmoji}>{thumb.value}</Text>;
      case 'image':
        return <Image source={thumb.source} style={styles.stripImage} resizeMode="contain" />;
      case 'uri':
        return <Image source={{ uri: thumb.uri }} style={styles.stripAvatar} resizeMode="cover" />;
      case 'icon':
        return (
          <MaterialCommunityIcons
            name={thumb.name}
            size={22}
            color={selected ? colors.primary : colors.textSecondary}
          />
        );
    }
  };

  const renderItem = (item: PackItem) => {
    if (item.type === 'couple') {
      const e = item.emoji;
      return (
        <Pressable
          key={item.key}
          style={({ pressed }) => [styles.cell, styles.coupleCell, pressed && styles.pressed]}
          onPress={() => onSendCoupleEmoji(e.id)}
          onLongPress={() => onManageCoupleEmoji(e)}
          accessibilityRole="button"
          accessibilityLabel={`우리 이모지 ${e.label} 보내기. 길게 누르면 무드 올리기·삭제`}
        >
          <Image source={{ uri: e.imageUrl }} style={styles.coupleThumb} resizeMode="cover" />
          {/* 무드에 올라간 장은 점 하나로 — 안 보이면 "길게 눌러 바꾼다"를 알 방법이 없다 */}
          {e.moodVisible ? <View style={styles.moodDot} /> : null}
        </Pressable>
      );
    }
    if (item.type === 'image') {
      // 움직이는 이모티콘은 칸마다 PRO 가 갈린다 — 팩 잠금과 칸 잠금을 함께 본다
      const locked = packLocked || (item.premium && !premiumAllowed);
      return (
        <Pressable
          key={item.key}
          style={({ pressed }) => [styles.cell, locked && styles.locked, pressed && styles.pressed]}
          onPress={() => onSendSticker(item.code, locked, active.label)}
          accessibilityRole="button"
          accessibilityLabel={`이모티콘 ${item.label} 보내기${locked ? ' — PRO 기능' : ''}`}
        >
          <Image source={item.source} style={styles.cellImage} resizeMode="contain" />
        </Pressable>
      );
    }
    return (
      <Pressable
        key={item.key}
        style={({ pressed }) => [styles.cell, packLocked && styles.locked, pressed && styles.pressed]}
        onPress={() => onSendSticker(item.value, packLocked, item.label)}
        accessibilityRole="button"
        accessibilityLabel={`이모지 ${item.value} 보내기${packLocked ? ' — PRO 기능' : ''}`}
      >
        <Text style={styles.cellEmoji}>{item.value}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ height }}>
      {/* 팩 스트립 — 무엇이 들어 있는지가 여기서 끝난다 */}
      <View style={styles.strip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripRow}
        >
          {packs.map((p) => {
            const selected = p.key === active.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.stripBtn, selected && styles.stripBtnActive]}
                onPress={() => selectPack(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} 팩${p.premium ? ' — PRO 전용' : ''}`}
              >
                {renderThumb(p.thumb, selected)}
                {/*
                  재생 배지 · 자물쇠 — 열기 전에 성격을 알 수 있게. 아이콘 자체가 원형이라
                  받침은 흰 원 하나면 된다(썸네일이 밝으면 아이콘이 묻힌다).
                */}
                {p.animated ? (
                  <View style={styles.stripBadge}>
                    <MaterialCommunityIcons name="play-circle" size={12} color={colors.textSecondary} />
                  </View>
                ) : null}
                {p.premium && !premiumAllowed ? (
                  <View style={styles.stripBadge}>
                    <MaterialCommunityIcons name="lock-outline" size={11} color={colors.together} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/*
        팩이 통째로 잠겼을 때만 이유를 한 줄 적는다. 스트립 자물쇠만으로는 격자가
        왜 흐린지 설명이 안 되고, 안 잠긴 팩에까지 이름표를 두면 예전처럼 격자가 밀린다.
      */}
      {packLocked ? (
        <View style={styles.lockedNote}>
          <MaterialCommunityIcons name="lock-outline" size={12} color={colors.together} />
          <Text style={styles.lockedNoteText}>{active.label} · PRO 전용</Text>
        </View>
      ) : null}

      {active.key === COUPLE_PACK && active.items.length === 0 ? (
        /*
         * 빈 격자를 그대로 두지 않는다 — 예전 "이모티콘" 탭이 곰돌이 한 마리만 띄워
         * 고장처럼 보였던 것과 같은 실수다. 아직 없을 때는 설명 카드가 격자를 대신한다.
         */
        <View style={styles.gridPad}>
          <Pressable
            style={({ pressed }) => [styles.emptyCard, pressed && styles.pressed]}
            onPress={onCreateCoupleEmoji}
            accessibilityRole="button"
            accessibilityLabel="우리 이모지 만들기"
          >
            <MaterialCommunityIcons name="face-woman-shimmer-outline" size={28} color={colors.primary} />
            <Text style={styles.emptyTitle}>우리 이모지 만들기</Text>
            <Text style={styles.emptyText}>
              사진 한 장으로 감정 17종 이모지를 만들어요. 둘 다 쓸 수 있어요.
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
          {active.items.map(renderItem)}
          {/* 격자 마지막 칸 = 추가 버튼. 세트를 여러 벌 만들 수 있다 */}
          {active.key === COUPLE_PACK ? (
            <Pressable
              style={({ pressed }) => [styles.cell, styles.coupleCell, styles.addCell, pressed && styles.pressed]}
              onPress={onCreateCoupleEmoji}
              accessibilityRole="button"
              accessibilityLabel="우리 이모지 더 만들기"
            >
              <MaterialCommunityIcons name="plus" size={22} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      {/*
       * 96종짜리 이모지 피커(카테고리 6개 + 한글 검색) 진입점 — 기본 이모지 팩에서만.
       * 예전엔 격자 안 "⋯" 한 칸이라 스티커처럼 생겨서 발견이 안 됐다(2026-09-07 분석).
       */}
      {active.key === EMOJI_PACK ? (
        <Pressable
          style={({ pressed }) => [styles.moreRow, pressed && styles.pressed]}
          onPress={onOpenEmojiSheet}
          accessibilityRole="button"
          accessibilityLabel="이모지 더 보기 — 검색으로 찾기"
        >
          <MaterialCommunityIcons name="magnify" size={18} color={colors.textSecondary} />
          <Text style={styles.moreText}>이모지 더 보기 · 검색</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  strip: {
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stripRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  stripBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 고른 팩만 카드 색으로 떠오른다 — 스트립 바닥(surfaceAlt)과 대비가 나는 유일한 신호다
  stripBtnActive: { backgroundColor: colors.surfaceCard },
  // lineHeight 를 fontSize 보다 크게 주면 iOS 가 그 여유분을 글리프 위에 몰아 준다(MoodPicker 주석)
  stripEmoji: { fontSize: 22, lineHeight: 22 },
  stripImage: { width: 28, height: 28 },
  stripAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceCard },
  stripBadge: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.surfaceCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  lockedNoteText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.together },
  scroll: { flex: 1 },
  /*
   * 한 줄 5칸 — 예전엔 8칸(11.5%)이라 그림 이모티콘이 32px 였고 표정이 안 보였다.
   * 18.5% × 5 = 92.5%, 남는 7.5% 를 space-between 이 칸 사이로 고르게 흩는다
   * (고정 width 로 두면 좁은 기기에서 남는 폭이 전부 오른쪽에 몰린다 — 예전 실측 40px).
   */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  gridPad: { padding: spacing.sm },
  cell: {
    width: '18.5%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellEmoji: { fontSize: 36, lineHeight: 36 },
  cellImage: { width: '86%', height: '86%' },
  // 우리 이모지는 생성물에 흰 배경이 딸려 오므로 원형으로 잘라 낸다
  coupleCell: { borderRadius: radius.full, overflow: 'hidden', backgroundColor: colors.surfaceAlt },
  coupleThumb: { width: '100%', height: '100%' },
  addCell: { borderWidth: 1, borderColor: colors.border, backgroundColor: 'transparent' },
  moodDot: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.surface,
    backgroundColor: colors.primary,
  },
  locked: { opacity: 0.45 },
  pressed: { opacity: 0.6 },
  emptyCard: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  emptyTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  emptyText: { fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'center' },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: 44,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  moreText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
}));
