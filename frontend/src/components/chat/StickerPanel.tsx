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
 * <p>팩 경계는 카탈로그가 이미 갖고 있다 — {@code STICKER_CHARACTERS}(캐릭터별 묶음)와
 * 움직이는 이모티콘 한 묶음. 여기서 새로 나누지 않고 그대로 가져와 스트립 칸으로 편다.
 * 캐릭터가 늘면 스트립 칸이 저절로 하나 더 생긴다(stickerImages.ts 의
 * {@code StickerCharacter} 주석과 같은 약속).
 *
 * <p><b>유니코드 이모지 팩은 스트립에 없다</b>(2026-09-14). 기본 16종 + 시즌 40종을 팩으로
 * 두던 것을 폐지했다 — 폰 키보드에 이미 있는 글자라 팩으로 묶을 이유가 약했고, 시즌 팩은
 * PRO 로 팔기까지 해서 무료 이모지 시트와 12종이 겹치는 사고를 냈다
 * (docs/STICKER_PACK_OVERLAP_2026-09-14.md). 이모지가 필요하면 스트립 맨 끝 버튼으로
 * 96종 검색 시트를 연다 — 팩 여섯 칸보다 넓고, 한글로 찾을 수 있다.
 *
 * <p><b>화면에서 떼어낸 이유</b>: ChatRoomScreen 이 이미 2200줄이다. 패널은 자기
 * 상태(고른 팩)만 갖고 나머지는 콜백으로 올려 보내므로, 말풍선 렌더와 얽히지 않는다.
 */
import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { CachedImage } from '../CachedImage';
import { MaterialCommunityIcons } from '../Icon';
import { ANIMATED_STICKERS } from '../../constants/animatedStickers';
import { STICKER_CHARACTERS } from '../../constants/stickerImages';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { CoupleEmoji } from '../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/** 스트립 칸에 그릴 그림 — 팩 종류마다 갖고 있는 게 다르다(유니코드 · 번들 PNG · 원격 URL) */
type PackThumb =
  | { type: 'image'; source: ImageSourcePropType }
  | { type: 'uri'; uri: string }
  | { type: 'icon'; name: IconName };

/** 격자 한 칸 */
type PackItem =
  /** premium 은 움직이는 이모티콘처럼 <b>한 팩 안에서 칸마다</b> 갈리는 경우에만 true 다 */
  | { type: 'image'; key: string; code: string; label: string; source: ImageSourcePropType; premium: boolean }
  | { type: 'couple'; key: string; emoji: CoupleEmoji };

interface PanelPack {
  key: string;
  label: string;
  thumb: PackThumb;
  /** 움직이는 이모티콘 — 스트립에 재생 배지 */
  animated: boolean;
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
 * <b>3줄 = 18장</b>이 온전히 들어간다. 가장 큰 캐릭터 팩이 14장이므로 스크롤 없이 다 보인다.
 * 더 줄이면 3줄째가 잘려 "아래에 뭔가 더 있다"가 안 읽힌다.
 *
 * <p>고정값이지 내용 높이가 아니다 — 팩마다 높이가 달라지면 팩을 넘길 때마다 입력바가
 * 위아래로 튄다(`useKeyboardPanelHeight` 주석이 2026-09-11 에 없앤 증상).
 */
const MAX_PANEL_HEIGHT = 240;

/** 우리 이모지 팩의 키 — 이 팩을 처음 열 때만 서버에서 받아온다 */
const COUPLE_PACK = 'COUPLE';

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
  onOpenCouplePack,
}: Props) {
  const [activeKey, setActiveKey] = useState<string>(DEFAULT_PACK);

  const packs = useMemo<PanelPack[]>(() => {

    /*
     * 순서 = 손이 가는 순서다. 우리 이모지는 "내 얼굴"이라 그림 팩 바로 뒤에 둔다 —
     * 있는 사람에겐 가장 자주 쓰는 팩이다.
     */
    return [
      {
        key: 'ANIMATED',
        label: '움직이는 이모티콘',
        thumb: { type: 'image', source: ANIMATED_STICKERS[0].thumb },
        // 무료 6 + PRO 24 가 한 팩 안에 섞여 있다 — 잠금은 팩이 아니라 칸 단위다
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
        animated: false,
        items: coupleEmojis.map((e) => ({ type: 'couple', key: `couple-${e.id}`, emoji: e })),
      },
    ];
  }, [coupleEmojis]);

  const active = packs.find((p) => p.key === activeKey) ?? packs[0];

  const selectPack = (key: string) => {
    setActiveKey(key);
    if (key === COUPLE_PACK) onOpenCouplePack();
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
    // 남은 갈래는 그림뿐이다 — 움직이는 이모티콘만 칸마다 PRO 가 갈린다
    {
      const locked = item.premium && !premiumAllowed;
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
  };

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
            return (
              <Pressable
                key={p.key}
                style={[styles.stripBtn, selected && styles.stripBtnActive]}
                onPress={() => selectPack(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.label} 팩`}
              >
                {renderThumb(p.thumb, selected)}
                {/*
                  재생 배지 — 열기 전에 성격을 알 수 있게. 아이콘 자체가 원형이라 받침은
                  흰 원 하나면 된다(썸네일이 밝으면 아이콘이 묻힌다).
                */}
                {p.animated ? (
                  <View style={styles.stripBadge}>
                    <MaterialCommunityIcons name="play-circle" size={12} color={colors.textSecondary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}

          {/*
           * 유니코드 이모지 진입점은 <b>없다</b>(2026-09-15).
           *
           * <p>이력: 기본 16종 + 시즌 40종을 팩 여섯 칸으로 늘어놨다가, 폰 키보드에 이미
           * 있는 글자를 팩으로 묶은 것이라 자리만 먹고 PRO 판매까지 겹쳐(무료 시트와 12종
           * 중복 — docs/STICKER_PACK_OVERLAP_2026-09-14.md) 한 칸짜리 검색 시트로 줄였고,
           * 이제 그 한 칸마저 없앴다 — 같은 논리를 끝까지 적용한 것이다.
           *
           * <p>시트에만 있던 값인 "큰 이모지"는 <b>이모지만 있는 메시지를 크게 그리는</b>
           * 쪽으로 옮겼다(ChatRoomScreen 의 isBigEmoji · utils/emojiOnly.ts) — 키보드로
           * 보내면 같은 결과다. 팩 스트립은 이제 이모티콘 팩과 우리 이모지만 담는다.
           */}
        </ScrollView>
      </View>

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
}));
