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
import { isCutoutEmoji } from '../../utils/coupleEmoji';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View, type ImageSourcePropType } from 'react-native';
import { CachedImage } from '../CachedImage';
import { MaterialCommunityIcons } from '../Icon';
import { ANIMATED_STICKERS, animatedStickerOf } from '../../constants/animatedStickers';
import { useRemoteStickerStore } from '../../store/remoteStickerStore';
import { applyOrder, useStickerPrefsStore } from '../../store/stickerPrefsStore';
import { STICKER_CHARACTERS, stickerImageOf } from '../../constants/stickerImages';
import type { StickerContext } from '../../constants/contextStickers';
import type { StickerSuggestion } from '../../utils/stickerCodes';
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
 * 비정상적으로 낮은 키보드 높이(하드웨어 키보드의 예측 막대만 뜬 경우 등)에서 격자가 한 줄도
 * 안 들어가는 것만 막는 바닥값. 실제 화면 키보드는 이보다 늘 크다(가장 낮게 본 기기가 약 233dp).
 */
const DEGENERATE_FLOOR = 180;

/**
 * 패널 높이 = <b>키보드 높이 그대로</b>(2026-10-01).
 *
 * <p>예전엔 264~320 사이로 가두고 {@code maxHeight} 로 줬다(작은 팩에서 아래가 비는 것을 줄이려고,
 * 09-17·09-22). 그 결과 키보드가 264 보다 낮거나 320 보다 높은 기기에서는 키보드 ↔ 패널을 오갈 때마다
 * 입력바가 그 차이만큼 튀었고, 작은 팩으로 넘기면 패널이 줄어 대화가 아래로 내려앉았다.
 * 카톡처럼 "키보드가 있던 자리를 같은 높이로 이어받는다"를 우선한다 — 작은 팩은 아래가 빈 채로 둔다.
 * 호출부가 iOS 홈 인디케이터 띠를 이미 뺀 값을 넘긴다(ChatRoomScreen 의 panelHeight).
 */
function panelHeight(keyboardHeight: number): number {
  return Math.max(keyboardHeight, DEGENERATE_FLOOR);
}

/**
 * 격자 한 칸의 크기(dp) — <b>퍼센트가 아니라 고정값</b>이다.
 *
 * <p>예전엔 {@code width: '15.5%'} 로 한 줄 6칸을 못 박았다. 그러면 화면이 넓어질수록
 * <b>칸이 커지기만 하고 개수는 그대로다</b> — 태블릿(800dp)에서 한 칸이 124dp 가 되어
 * 스티커가 우스꽝스럽게 크고, 정작 한 번에 보이는 장수는 폰과 같았다(2026-09-22 실기기).
 *
 * <p>고정 크기로 두면 <b>폭이 넓을수록 칸이 늘어난다</b> — 폰은 6~7칸, 태블릿은 13칸.
 * 그림 크기는 어디서나 같고, 넓은 화면이 그만큼 더 보여준다는 당연한 동작이 된다.
 *
 * <p>46dp 인 근거: 이보다 작게 가면 그림이 40px 아래로 떨어지는데, 8칸(11.5%) 시절
 * 32px 로 "표정이 안 보인다"던 그 경계에 가까워진다. 46dp 칸의 그림은 약 40px 이다.
 */
const CELL_SIZE = 46;

/** 우리 이모지 팩의 키 앞자리 — 이 팩을 처음 열 때만 서버에서 받아온다 */
const COUPLE_PACK_PREFIX = 'COUPLE_';
const COUPLE_PACK_MINE = `${COUPLE_PACK_PREFIX}MINE`;
const COUPLE_PACK_PARTNER = `${COUPLE_PACK_PREFIX}PARTNER`;

/**
 * 기본으로 열리는 팩 — 움직이는 이모티콘(2026-09-22 부터 한 팩이다).
 *
 * <p>2026-09-07 에 기본 탭을 이모티콘으로 돌렸던 판단을 그대로 잇는다. 패널을 여는 사람
 * 대부분이 찾는 게 그림이다. 커플 앱이라 가장 많이 쓰는 결이 여기고, 무엇보다
 * <b>무료 팩</b>이다 — 패널을 열자마자 자물쇠를 마주하면 기능 전체가 유료처럼 보인다.
 */
const DEFAULT_PACK = 'ANIM_ALL';

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
  /** 탭 줄 끝 정리 버튼 — 이모티콘 설정(받기·숨기기·순서) 화면으로 */
  onOpenStickerSettings?: () => void;
  /** 우리 이모지 팩을 처음 열 때 — 안 쓰는 사람에게 방마다 조회를 붙이지 않는다 */
  onOpenCouplePack: () => void;
  /** 캐릭터 스티커 길게 누르기 — "문구 넣기" 시트. 움직이는 이모티콘·잠긴 팩에는 붙지 않는다 */
  onComposeTextSticker?: (code: string) => void;
  /**
   * 맥락 칸(기념일·상대 무드) — 있으면 스트립 맨 앞에 서고, 패널을 열면 이 칸부터 보인다.
   * 잠긴 팩은 호출부가 이미 걸러서 준다. constants/contextStickers.ts
   */
  contextPack?: ContextPack | null;
  /** 맥락 칸에서 골라 보냈다 — 계측용(전송 자체는 onSendSticker 가 한다) */
  onContextPicked?: (item: StickerSuggestion) => void;
}

export interface ContextPack {
  context: StickerContext;
  /** 스트립 칸 이름표 — "D+100 축하해요" · "지민 기분" */
  label: string;
  /** 격자 위 한 줄 — "지금 지민의 기분: 😢 슬픔" */
  caption?: string;
  items: StickerSuggestion[];
}

const CONTEXT_PACK_KEY = 'context';

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
  onOpenStickerSettings,
  onOpenCouplePack,
  onComposeTextSticker,
  contextPack,
  onContextPicked,
}: Props) {
  // 패널은 열 때 마운트된다 — 맥락 칸이 있으면 거기서 시작한다. 연 뒤에 맥락이 생겨도 탭을 옮기지 않는다
  const [activeKey, setActiveKey] = useState<string>(() =>
    contextPack && contextPack.items.length > 0 ? CONTEXT_PACK_KEY : DEFAULT_PACK,
  );
  const loadPacks = useStickerStore((s) => s.load);
  const packOf = useStickerStore((s) => s.packOf);
  const serverPacks = useStickerStore((s) => s.packs);
  // 서버 배포 이모티콘(store/remoteStickerStore) — 격자에는 썸네일만 받는다
  const remotePacks = useRemoteStickerStore((s) => s.packs);

  // 패널이 처음 그려질 때 한 번. 안 열어 본 사람에게는 조회가 아예 안 간다.
  useEffect(() => { void loadPacks(); }, [loadPacks]);
  useEffect(() => { void useRemoteStickerStore.getState().refresh(); }, []);
  // 순서·숨김·받은 서버 팩(store/stickerPrefsStore) — 정리는 패널(보내는 쪽)에만 걸린다
  const prefsOrder = useStickerPrefsStore((s) => s.order);
  const prefsHidden = useStickerPrefsStore((s) => s.hidden);
  const prefsDownloaded = useStickerPrefsStore((s) => s.downloaded);
  const prefsSeen = useStickerPrefsStore((s) => s.seen);
  useEffect(() => { void useStickerPrefsStore.getState().load(); }, []);
  // 앱에 든 팩 id — 이게 아니면 서버에만 있는 팩이라 받아야 선다
  const bundledPackIds = useMemo(() => new Set(ANIMATED_STICKERS.map((a) => a.packId)), []);
  // 설정 화면에서 아직 못 본 서버 팩 — 정리 버튼에 점을 찍는다
  const hasNewPack = remotePacks.some((p) => !bundledPackIds.has(p.id) && !prefsSeen.includes(p.id));

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
    /*
     * 서버 배포 이모티콘 — 같은 팩 id 면 번들 뒤에 잇고(ANIM_ALL 의 추가분), 새 팩이면 새 칸이 된다.
     * 번들이 먼저인 이유: 썸네일이 이미 기기에 있어 패널을 열자마자 그려진다.
     */
    for (const p of remotePacks) {
      const items = animatedByPack.get(p.id) ?? [];
      for (const s of p.items) {
        items.push({ type: 'image', key: s.code, code: s.code, label: s.label, source: { uri: s.thumbUrl } });
      }
      if (items.length > 0) animatedByPack.set(p.id, items);
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

    /*
     * 맥락 칸 — 그 순간에만 맨 앞. 캐릭터 스티커와 움직이는 이모티콘이 섞여 있어 animated 로 둔다:
     * 스트립에 재생 배지가 붙고, 문구 넣기(캐릭터 전용)는 이 칸에서 붙지 않는다.
     */
    const contextPacks: PanelPack[] = [];
    if (contextPack && contextPack.items.length > 0) {
      const items: PackItem[] = [];
      for (const s of contextPack.items) {
        const remote = useRemoteStickerStore.getState().byCode[s.code];
        const source =
          s.kind === 'image'
            ? stickerImageOf(s.code)?.source
            : animatedStickerOf(s.code)?.thumb ?? (remote ? { uri: remote.thumbUrl } : undefined);
        if (source) items.push({ type: 'image', key: `${CONTEXT_PACK_KEY}-${s.code}`, code: s.code, label: s.label, source });
      }
      const first = items[0];
      if (first && first.type === 'image') {
        contextPacks.push({
          key: CONTEXT_PACK_KEY,
          label: contextPack.label,
          thumb: { type: 'image', source: first.source },
          animated: true,
          items,
        });
      }
    }

    /*
     * 정리 적용 — 서버에만 있는 팩은 받은 것만, 숨긴 칸은 빼고, 사용자 순서로. 맥락 칸(맨 앞)과
     * 우리 이모지(맨 끝)는 정리 대상이 아니다(utils/stickerPackList 주석). 다 숨겨도 설정 화면이
     * 한 칸은 남기게 막는다.
     */
    const managed = applyOrder(
      [...animatedPacks, ...characterPacks].filter(
        (p) =>
          (bundledPackIds.has(p.key) || !p.animated || prefsDownloaded.includes(p.key)) &&
          !prefsHidden.includes(p.key),
      ),
      prefsOrder,
    );

    return [...contextPacks, ...managed, ...couplePacks];

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
  }, [coupleEmojis, myUserId, partnerName, packOf, serverPacks, contextPack, remotePacks,
    prefsOrder, prefsHidden, prefsDownloaded, bundledPackIds]);

  const active = packs.find((p) => p.key === activeKey) ?? packs[0];
  const activePack = active?.packId ? packOf(active.packId) : undefined;
  // 모르면 열린 것으로 본다 — 통신 문제로 잠긴 것처럼 보이는 쪽이 훨씬 나쁜 실패다
  const activeLocked = activePack ? !activePack.usable : false;
  const isCouplePack = active?.key.startsWith(COUPLE_PACK_PREFIX) ?? false;
  const isContextPack = active?.key === CONTEXT_PACK_KEY;
  const canCompose = !!onComposeTextSticker && !!active && !active.animated && !isCouplePack && !activeLocked;

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
          // 배경을 따낸 이모지는 원판 없이 — 채팅에 그려지는 모양과 같게
          style={({ pressed }) => [styles.cell, !isCutoutEmoji(e.imageUrl) && styles.coupleCell, pressed && styles.pressed]}
          onPress={() => onSendCoupleEmoji(e.id)}
          onLongPress={() => onManageCoupleEmoji(e)}
          accessibilityRole="button"
          accessibilityLabel={`우리 이모지 ${e.label} 보내기. 길게 누르면 무드 올리기·삭제`}
        >
          <CachedImage uri={e.imageUrl} style={styles.coupleThumb} contentFit={isCutoutEmoji(e.imageUrl) ? 'contain' : 'cover'} />
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
        onPress={() => {
          onSendSticker(item.code, activeLocked, active.label);
          if (isContextPack) {
            const picked = contextPack?.items.find((s) => s.code === item.code);
            if (picked) onContextPicked?.(picked);
          }
        }}
        // 문구 스티커는 캐릭터 스티커에만 — 잠긴 팩에서 길게 누르면 짧게 누른 것과 같은 안내로 간다
        onLongPress={canCompose ? () => onComposeTextSticker?.(item.code) : undefined}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`이모티콘 ${item.label} 보내기${activeLocked ? ' — 잠김' : ''}${canCompose ? '. 길게 누르면 문구 넣기' : ''}`}
      >
        <Image source={item.source} style={styles.cellImage} resizeMode="contain" />
      </Pressable>
    );
  };

  if (!active) {
    // 아직 팩이 없을 때는 자리만 지킨다 — 여기서 줄이면 패널을 여는 순간 화면이 튄다
    return <View style={{ height: panelHeight(height) }} />;
  }

  return (
    <View style={{ height: panelHeight(height) }}>
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
          {onOpenStickerSettings ? (
            // 카카오톡의 이모티콘 설정 자리 — 받기·숨기기·순서. 새 팩이 있으면 점
            <Pressable
              style={styles.stripBtn}
              onPress={onOpenStickerSettings}
              accessibilityRole="button"
              accessibilityLabel={`이모티콘 설정${hasNewPack ? ' — 새 이모티콘이 있어요' : ''}`}
            >
              <MaterialCommunityIcons name="format-list-bulleted" size={20} color={colors.textSecondary} />
              {hasNewPack ? <View style={styles.newDot} /> : null}
            </Pressable>
          ) : null}
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
              사진 한 장으로 둘의 감정 이모지를 만들어요. 둘 다 쓸 수 있어요.
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* 맥락 칸의 한 줄 — 왜 이 스티커들이 맨 앞에 있는지("지금 지민의 기분: 😢 슬픔") */}
          {isContextPack && contextPack?.caption ? (
            <Text style={styles.contextCaption} numberOfLines={1}>
              {contextPack.caption}
            </Text>
          ) : null}
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
  newDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
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
  // flex:1 을 주지 않는다 — 주면 부모가 내용 높이를 못 잡아 작은 팩에서도 끝까지 늘어난다
  scroll: { flexGrow: 0, flexShrink: 1 },
  // 잠긴 팩 — 그림은 보이되 "아직 내 것이 아니다"가 읽혀야 한다
  lockedGrid: { opacity: 0.45 },
  /*
   * 칸 크기는 CELL_SIZE 가 정하고 <b>줄당 개수는 폭이 정한다</b>(위 주석).
   *
   * <p><b>칸 수 변천</b>: 8칸(11.5%) → 그림이 32px 라 표정이 안 보였다 → 5칸(18.5%)
   * → 6칸(15.5%) → 7칸(13.2%) → <b>고정 46dp</b>(2026-09-22). 퍼센트를 버린 이유는
   * 넓은 화면에서 칸만 커지고 개수가 안 늘었기 때문이다.
   */  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // 칸이 고정 크기라 왼쪽부터 채운다 — space-between 이면 마지막 줄만 벌어져 어긋나 보인다
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  gridPad: { padding: spacing.sm },
  contextCaption: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
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
