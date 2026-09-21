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
 * <p><b>잠금은 팩 단위다</b>(2026-09-21). 예전엔 칸마다 갈렸는데 — 움직이는 이모티콘 한 팩
 * 안에서 무료 6 / PRO 24 — 그러면 "무엇을 사는가"가 격자 안에 흩어져 읽히지 않는다.
 * 지금은 주제별 팩이 판매 단위이고, 잠긴 팩은 스트립에서 자물쇠로 보이고 열면 격자가
 * 흐려진 채 잠금 해제 줄이 깔린다 — <b>살 것을 먼저 보여준 뒤에 값을 말한다</b>.
 * 판정은 서버가 내려준다(`stickerStore`), 이 화면은 그리기만 한다.
 *
 * <p><b>우리 이모지는 사람별로 나뉜다</b>(2026-09-21). 커플이 각자 얼굴로 만들기 때문에
 * 한 팩에 섞어 두면 내 얼굴과 상대 얼굴이 같은 격자에서 뒤섞인다 — 보내려던 장을 찾는
 * 데 시간이 걸리고, 세트가 두 벌이라는 것도 안 읽힌다. `subjectUserId`(누구 얼굴인가)로
 * 갈라 스트립 칸 두 개로 편다.
 *
 * <p><b>유니코드 이모지 팩은 스트립에 없다</b>(2026-09-14). 기본 16종 + 시즌 40종을 팩으로
 * 두던 것을 폐지했다 — 폰 키보드에 이미 있는 글자라 팩으로 묶을 이유가 약했고, 시즌 팩은
 * PRO 로 팔기까지 해서 무료 이모지 시트와 12종이 겹치는 사고를 냈다
 * (docs/STICKER_PACK_OVERLAP_2026-09-14.md). 이모지가 필요하면 키보드로 보내면 되고,
 * 이모지만 있는 메시지는 크게 그려진다(ChatRoomScreen 의 isBigEmoji).
 *
 * <p><b>화면에서 떼어낸 이유</b>: ChatRoomScreen 이 이미 2200줄이다. 패널은 자기
 * 상태(고른 팩)만 갖고 나머지는 콜백으로 올려 보내므로, 말풍선 렌더와 얽히지 않는다.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { CachedImage } from '../CachedImage';
import { MaterialCommunityIcons } from '../Icon';
import { ANIMATED_STICKERS } from '../../constants/animatedStickers';
import { STICKER_CHARACTERS } from '../../constants/stickerImages';
import { CHARACTER_PACKS } from '../../constants/stickerPacks';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { useStickerStore } from '../../store/stickerStore';
import { themedStyles } from '../../theme/themedStyles';
import type { CoupleEmoji, StickerPack } from '../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** 스트립 칸에 그릴 그림 — 팩 종류마다 갖고 있는 게 다르다(번들 PNG · 원격 URL · 아이콘) */
type PackThumb =
  | { type: 'image'; source: ImageSourcePropType }
  | { type: 'uri'; uri: string }
  | { type: 'icon'; name: IconName };

/** 격자 한 칸 */
type PackItem =
  | { type: 'image'; key: string; code: string; label: string; source: ImageSourcePropType }
  | { type: 'couple'; key: string; emoji: CoupleEmoji };

interface PanelPack {
  key: string;
  label: string;
  thumb: PackThumb;
  /** 움직이는 이모티콘 — 스트립에 재생 배지 */
  animated: boolean;
  /**
   * 서버 `sticker_packs.id`. 없으면 판매 단위가 아니다(우리 이모지처럼 만들어 쓰는 것들) —
   * 잠글 일도 팔 일도 없다.
   */
  packId?: string;
  items: PackItem[];
}

/**
 * 패널 높이의 상한.
 *
 * <p>호출부는 키보드 높이를 넘겨준다 — 패널이 키보드 자리를 이어받는 물건이라 그게 기본이다.
 * 그런데 기기에 따라 키보드가 320px 를 넘고, 그러면 팩 대부분이(10~14장) 다 차고도 아래가
 * 남아 빈 칸이 크게 보인다(2026-09-17 제보).
 *
 * <p>240px 인 근거: 스트립 40 + 여백 16 을 빼면 184px 이고, 6칸 격자의 한 줄이 약 59px 이라
 * <b>3줄 = 18장</b>이 온전히 들어간다. 가장 큰 팩이 14장이므로 스크롤 없이 다 보인다.
 * 더 줄이면 3줄째가 잘려 "아래에 뭔가 더 있다"가 안 읽힌다.
 *
 * <p>고정값이지 내용 높이가 아니다 — 팩마다 높이가 달라지면 팩을 넘길 때마다 입력바가
 * 위아래로 튄다(`useKeyboardPanelHeight` 주석이 2026-09-11 에 없앤 증상).
 */
const MAX_PANEL_HEIGHT = 240;

/** 우리 이모지 팩의 키 앞자리 — 이 팩을 처음 열 때만 서버에서 받아온다 */
const COUPLE_PACK_PREFIX = 'COUPLE_';
const COUPLE_PACK_MINE = `${COUPLE_PACK_PREFIX}MINE`;
const COUPLE_PACK_PARTNER = `${COUPLE_PACK_PREFIX}PARTNER`;

/**
 * 기본으로 열리는 팩 — 사랑.
 *
 * <p>2026-09-07 에 기본 탭을 이모티콘으로 돌렸던 판단을 그대로 잇는다. 패널을 여는 사람
 * 대부분이 찾는 게 그림이다. 커플 앱이라 가장 많이 쓰는 결이 여기고, 무엇보다
 * <b>무료 팩</b>이다 — 패널을 열자마자 자물쇠를 마주하면 기능 전체가 유료처럼 보인다.
 */
const DEFAULT_PACK = 'ANIM_LOVE';

interface Props {
  /** 키보드가 있던 자리를 그대로 이어받는 높이 — 탭을 바꿔도 흔들리지 않아야 한다 */
  height: number;
  /** 내 userId — 우리 이모지를 "내 것 / 상대 것"으로 가르는 기준 */
  myUserId?: number | null;
  /** 스트립 칸 이름표에 쓴다 (예: "지은 이모지") */
  partnerName: string;
  coupleEmojis: CoupleEmoji[];
  onSendSticker: (code: string, locked: boolean, label: string) => void;
  onSendCoupleEmoji: (emojiId: number) => void;
  /** 길게 누르기 — 무드 노출 토글 · 삭제 */
  onManageCoupleEmoji: (emoji: CoupleEmoji) => void;
  onCreateCoupleEmoji: () => void;
  /** 잠긴 팩을 열려고 할 때 — 구매 시트/업그레이드 안내는 화면이 띄운다 */
  onUnlockPack: (pack: StickerPack) => void;
  /** 우리 이모지 팩을 처음 열 때 — 안 쓰는 사람에게 방마다 조회를 붙이지 않는다 */
  onOpenCouplePack: () => void;
}

export function StickerPanel({
  height,
  myUserId,
  partnerName,
  coupleEmojis,
  onSendSticker,
  onSendCoupleEmoji,
  onManageCoupleEmoji,
  onCreateCoupleEmoji,
  onUnlockPack,
  onOpenCouplePack,
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(DEFAULT_PACK);
  const loadPacks = useStickerStore((s) => s.load);
  const packOf = useStickerStore((s) => s.packOf);
  const serverPacks = useStickerStore((s) => s.packs);

  // 패널이 처음 그려질 때 한 번. 안 열어 본 사람에게는 조회가 아예 안 간다.
  useEffect(() => { void loadPacks(); }, [loadPacks]);

  const packs = useMemo<PanelPack[]>(() => {
    /*
     * 순서 = 손이 가는 순서다. 무료 이모티콘 → 캐릭터 → 유료 주제팩 → 우리 이모지.
     * 우리 이모지를 끝에 두는 것은 "내 얼굴"이라 찾기 쉬운 자리(맨 끝)가 낫고, 없는
     * 사람에게는 빈 칸이 앞을 막지 않기 때문이다.
     */
    const animatedByPack = new Map<string, PackItem[]>();
    for (const a of ANIMATED_STICKERS) {
      const packId = a.packId;
      const items = animatedByPack.get(packId) ?? [];
      items.push({ type: 'image', key: a.code, code: a.code, label: a.label, source: a.thumb });
      animatedByPack.set(packId, items);
    }

    const animatedPacks: PanelPack[] = [...animatedByPack.entries()].map(([packId, items]) => ({
      key: packId,
      // 이름표는 서버가 준다 — 팩 이름을 바꿀 때 앱 배포를 기다리지 않는다
      label: packOf(packId)?.title ?? '이모티콘',
      thumb: { type: 'image', source: (items[0] as { source: ImageSourcePropType }).source },
      animated: true,
      packId,
      items,
    }));
    // 무료 팩이 먼저 — 잠긴 팩이 앞에 서면 패널이 유료처럼 보인다
    animatedPacks.sort((a, b) => Number(!isFree(a.packId)) - Number(!isFree(b.packId)));

    const characterPacks: PanelPack[] = STICKER_CHARACTERS.map((c) => ({
      key: c.key,
      label: c.label,
      thumb: { type: 'image', source: c.stickers[0].source },
      animated: false,
      packId: CHARACTER_PACKS[c.key],
      items: c.stickers.map((i) => ({
        type: 'image' as const, key: i.code, code: i.code, label: i.label, source: i.source,
      })),
    }));

    /*
     * 우리 이모지 — 얼굴 주인으로 가른다. 한 세트도 없는 쪽은 칸을 만들지 않는다(빈 칸이
     * 둘이면 "고장"으로 읽힌다). 둘 다 없으면 "내 이모지" 칸 하나만 남겨 만들기 안내를 띄운다.
     */
    const mine = coupleEmojis.filter((e) => myUserId != null && e.subjectUserId === myUserId);
    const theirs = coupleEmojis.filter((e) => myUserId == null || e.subjectUserId !== myUserId);
    const couplePacks: PanelPack[] = [];
    if (mine.length > 0 || theirs.length === 0) {
      couplePacks.push(couplePack(COUPLE_PACK_MINE, '내 이모지', mine));
    }
    if (theirs.length > 0) {
      couplePacks.push(couplePack(COUPLE_PACK_PARTNER, `${partnerName} 이모지`, theirs));
    }

    return [...animatedPacks, ...characterPacks, ...couplePacks];

    function isFree(packId?: string) {
      const pack = packId ? packOf(packId) : undefined;
      return !pack || (!pack.proOnly && pack.price === 0);
    }

    function couplePack(key: string, label: string, emojis: CoupleEmoji[]): PanelPack {
      return {
        key,
        label,
        // 아직 한 장도 없으면 그릴 썸네일이 없다 — 아이콘으로 자리를 지킨다(빈 격자 안내와 짝)
        thumb: emojis[0]
          ? { type: 'uri', uri: emojis[0].imageUrl }
          : { type: 'icon', name: 'face-woman-shimmer-outline' },
        animated: false,
        items: emojis.map((e) => ({ type: 'couple' as const, key: `couple-${e.id}`, emoji: e })),
      };
    }
    // serverPacks 를 의존성에 두는 이유: 팩 이름·잠금이 서버에서 늦게 도착한다
  }, [coupleEmojis, myUserId, partnerName, packOf, serverPacks]);

  const active = packs.find((p) => p.key === activeKey) ?? packs[0];
  const activePack = active?.packId ? packOf(active.packId) : undefined;
  // 모르면 열린 것으로 본다 — 통신 문제로 잠긴 것처럼 보이는 쪽이 훨씬 나쁜 실패다
  const activeLocked = activePack ? !activePack.usable : false;
  const isCouplePack = active?.key.startsWith(COUPLE_PACK_PREFIX) ?? false;

  const selectPack = (key: string) => {
    setActiveKey(key);
    if (key.startsWith(COUPLE_PACK_PREFIX)) onOpenCouplePack();
  };

  const renderThumb = (thumb: PackThumb, selected: boolean) => {
    switch (thumb.type) {
      case 'image':
        return <Image source={thumb.source} style={styles.stripImage} resizeMode="contain" />;
      case 'uri':
        // 우리 이모지 팩 썸네일 — 원격이라 디스크 캐시를 타야 한다(CachedImage 주석 참고)
        return <CachedImage uri={thumb.uri} style={styles.stripAvatar} contentFit="cover" />;
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
          <CachedImage uri={e.imageUrl} style={styles.coupleThumb} contentFit="cover" />
          {/* 무드에 올라간 장은 점 하나로 — 안 보이면 "길게 눌러 바꾼다"를 알 방법이 없다 */}
          {e.moodVisible ? <View style={styles.moodDot} /> : null}
        </Pressable>
      );
    }
    return (
      <Pressable
        key={item.key}
        style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
        // 잠긴 팩이면 전송이 아니라 안내로 간다 — locked 는 호출부가 해석한다
        onPress={() => onSendSticker(item.code, activeLocked, active.label)}
        accessibilityRole="button"
        accessibilityLabel={`이모티콘 ${item.label} 보내기${activeLocked ? ' — 잠김' : ''}`}
      >
        <Image source={item.source} style={styles.cellImage} resizeMode="contain" />
      </Pressable>
    );
  };

  if (!active) {
    return <View style={{ height: Math.min(height, MAX_PANEL_HEIGHT) }} />;
  }

  return (
    <View style={{ height: Math.min(height, MAX_PANEL_HEIGHT) }}>
      {/* 팩 스트립 — 무엇이 들어 있는지가 여기서 끝난다 */}
      <View style={styles.strip}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.stripRow}
        >
          {packs.map((p) => {
            const selected = p.key === active.key;
            const serverPack = p.packId ? packOf(p.packId) : undefined;
            const locked = serverPack ? !serverPack.usable : false;
            return (
              <Pressable
                key={p.key}
                style={[styles.stripBtn, selected && styles.stripBtnActive]}
                onPress={() => selectPack(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} 팩${locked ? ' — 잠김' : ''}`}
              >
                {renderThumb(p.thumb, selected)}
                {/*
                  배지는 한 자리뿐이다 — 자물쇠가 재생 배지를 이긴다. 잠긴 팩에서 알아야 할
                  것은 "움직인다"가 아니라 "아직 내 것이 아니다"이기 때문이다.
                */}
                {locked ? (
                  <View style={styles.stripBadge}>
                    <MaterialCommunityIcons name="lock-outline" size={11} color={colors.textSecondary} />
                  </View>
                ) : p.animated ? (
                  <View style={styles.stripBadge}>
                    <MaterialCommunityIcons name="play-circle" size={12} color={colors.textSecondary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isCouplePack && active.items.length === 0 ? (
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
        <>
          <ScrollView
            style={[styles.scroll, activeLocked && styles.lockedGrid]}
            contentContainerStyle={styles.grid}
          >
            {active.items.map(renderItem)}
            {/* 격자 마지막 칸 = 추가 버튼. 세트를 여러 벌 만들 수 있다 */}
            {isCouplePack ? (
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

          {/*
            잠금 해제 줄 — 격자 위에 깔린다. 격자를 숨기지 않는 것이 요점이다:
            무엇을 사는지 본 다음에 값을 읽어야 한다. 값은 서버가 내려준 것을 그대로 쓴다
            (앱에 박으면 가격을 바꿀 때마다 스토어 심사를 기다린다).
          */}
          {activeLocked && activePack ? (
            <Pressable
              style={({ pressed }) => [styles.unlockBar, pressed && styles.pressed]}
              onPress={() => onUnlockPack(activePack)}
              accessibilityRole="button"
              accessibilityLabel={`${activePack.title} 잠금 해제`}
            >
              <MaterialCommunityIcons name="crown" size={16} color={colors.primary} />
              <Text style={styles.unlockText} numberOfLines={1}>
                {activePack.price > 0
                  ? `${activePack.title} · ${activePack.price.toLocaleString()}원 · PRO는 전부 무료`
                  : `${activePack.title}은 PRO에서 쓸 수 있어요`}
              </Text>
            </Pressable>
          ) : null}
        </>
      )}
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
  scroll: { flex: 1 },
  // 잠긴 팩 — 그림은 보이되 "아직 내 것이 아니다"가 읽혀야 한다
  lockedGrid: { opacity: 0.45 },
  /*
   * 한 줄 6칸 — 15.5% × 6 = 93%, 남는 7% 를 space-between 이 칸 사이로 고르게 흩는다
   * (고정 width 로 두면 좁은 기기에서 남는 폭이 전부 오른쪽에 몰린다 — 예전 실측 40px).
   *
   * <p><b>칸 수 변천</b>: 8칸(11.5%) → 그림이 32px 라 표정이 안 보였다 → 5칸(18.5%, 67px)
   * → 지금 6칸(15.5%, 약 56px). 6칸으로 되돌린 이유는 <b>패널 높이를 줄이기 위해서</b>다
   * (아래 MAX_PANEL_HEIGHT 주석). 한 줄이 71px 에서 59px 로 낮아져, 같은 높이에 한 줄이 더
   * 들어간다. 48px 로 그려지는 그림은 32px 와 달리 표정이 읽힌다.
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
    width: '15.5%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  unlockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  unlockText: { flex: 1, fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
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
}));
