/**
 * 스티커 상점 — 팩을 둘러보고 잠긴 팩을 연다.
 *
 * <p><b>왜 따로 필요한가</b>: 채팅 패널에도 잠금 해제 줄이 있지만 그건 <b>부딪혔을 때</b>만
 * 보인다. 사고 싶은 사람이 제 발로 찾아갈 자리가 없으면 팩은 "쓰다가 막히면 결제를 권하는
 * 것"이 되고, 그건 상점이 아니라 업셀이다. 플랜 화면을 MY 에 둔 것과 같은 판단
 * (docs/PRO_UPSELL_AND_ADS_2026-09-17.md §2 — 자발적으로 보러 갈 수 있는 자리).
 *
 * <p><b>그림은 앱이, 값은 서버가.</b> 어느 팩에 뭐가 들었는지는 번들 카탈로그가 알고
 * (`constants/stickerPackPreview.ts`), 얼마인지·열려 있는지는 서버가 내려준다
 * (`GET /stickers/packs`). 가격을 앱에 박으면 바꿀 때마다 스토어 심사를 기다려야 한다.
 *
 * <p><b>카카오톡 이모티콘샵 목록의 모양이다</b>(2026-09-22). 왼쪽 대표 그림 하나 · 가운데
 * 이름과 설명 · 오른쪽 상태. 한 줄이 한 팩이라 눈이 세로로만 움직인다.
 *
 * <p>그 전에는 미리보기 다섯 칸이 카드에서 가장 큰 요소였다. 근거는 "44px 썸네일로는
 * 표정이 안 보여 무엇을 사는지가 안 읽힌다"였는데, 칸이 {@code flex: 1} 이라
 * <b>화면이 넓을수록 커지기만 했다</b> — 태블릿에서 한 칸이 150dp 가 되어 카드 하나가
 * 화면 절반을 먹었고, 목록이 아니라 광고판이 됐다.
 *
 * <p>지금은 <b>표정을 읽는 자리와 훑는 자리를 나눈다</b>: 대표 그림 하나는 56dp 로 크게
 * 두고(그 한 장이면 어떤 팩인지 안다), 나머지는 36dp 로 줄여 "안에 이런 것들이 있다"만
 * 알린다. 둘 다 고정 크기라 넓은 화면은 더 크게가 아니라 <b>더 많이</b> 보여준다
 * (`StickerPanel.CELL_SIZE` 와 같은 판단).
 *
 * <p><b>결제는 아직 안 붙었다.</b> 스토어 콘솔에 일회성 상품을 등록해야 이을 수 있고,
 * 그 상태를 `STICKER_PURCHASE_ENABLED` 한 줄이 들고 있다. 닫혀 있는 동안에는
 * <b>가격 버튼을 그리지 않는다</b> — 값을 붙여 놓고 누르면 "연결되지 않았어요"를 띄우는 건
 * 상점이 아니라 미끼다. 대신 "준비 중"으로 적고 값은 글자로만 보여준다. 콘솔 등록 뒤
 * 플래그를 켜고 `onBuy` 에서 `stickerApi.verifyGoogle/verifyApple` 로 이으면 된다.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { stickerApi } from '../../api/stickers';
import { STICKER_PURCHASE_ENABLED } from '../../constants/config';
import { previewOf } from '../../constants/stickerPackPreview';
import { useStickerStore } from '../../store/stickerStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { StickerPack } from '../../types';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

/**
 * 카테고리 — 한국어 이름과 아이콘.
 *
 * <p>서버 enum 을 그대로 보여줄 수는 없고, 아이콘이 있으면 <b>그림 없는 팩</b>(무드·터치)도
 * 카드가 비어 보이지 않는다. 그 둘은 유니코드/제스처라 썸네일이 없다.
 */
const CATEGORY: Record<StickerPack['category'], { label: string; icon: IconName }> = {
  ANIMATED: { label: '움직이는 이모티콘', icon: 'play-circle' },
  IMAGE: { label: '캐릭터 스티커', icon: 'emoticon-outline' },
  MOOD: { label: '무드', icon: 'face-woman-shimmer-outline' },
  TOUCH: { label: '가상 터치', icon: 'hand-heart-outline' },
};

export function StickerShopScreen() {
  const packs = useStickerStore((s) => s.packs);
  const replace = useStickerStore((s) => s.replace);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /*
   * 화면에 들어올 때마다 다시 읽는다 — 스토어의 load() 는 한 번만 읽는 캐시라
   * (패널이 방마다 조회하지 않게 하려고) 결제 직후 상태가 안 바뀐다. 상점은 값을 보러
   * 온 자리이므로 여기서는 항상 최신을 가져온다.
   */
  const load = useCallback(() => {
    setError(false);
    return stickerApi.packs()
      .then(replace)
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, [replace]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onBuy = (pack: StickerPack) => {
    Alert.alert(
      pack.title,
      `${pack.price.toLocaleString()}원에 살 수 있어요.\n\n`
      + '인앱결제가 아직 연결되지 않았어요. 스토어에 상품이 등록되면 바로 구매할 수 있어요.',
    );
  };

  if (loaded && error && packs.length === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <EmptyState
          icon="cloud-off-outline"
          title="상점을 불러오지 못했어요"
          description="네트워크 상태를 확인하고 다시 시도해주세요."
          error
          onRetry={load}
        />
      </SafeAreaView>
    );
  }

  /*
   * <b>스티커만 판다</b>(2026-09-22). 무드·터치 팩은 목록에서 뺐다 — 그림이 없어 아이콘만
   * 덩그러니 나오고, 무엇보다 <b>상점에서 고르는 물건이 아니다</b>. 무드는 홈의 기분 칩에서,
   * 터치는 채팅 트레이에서 고른다. 여기 있으면 "스티커 상점"이라는 이름이 거짓말이 된다.
   *
   * <p>잠금 판정은 그대로다 — 팩 행도 {@code Feature} 매핑도 손대지 않았고, 확장 무드와
   * 프리미엄 터치는 지금처럼 PRO 에서 열린다. <b>여기서는 안 보일 뿐이다.</b>
   *
   * <p>가진 것 먼저, 살 것은 뒤. 상점에 들어오자마자 값부터 보이면 둘러볼 마음이 사라진다.
   * 예전에는 "가지고 있어요 / 열려 있어요 / 더 있어요" 셋이었는데 앞의 둘을 합쳤다 —
   * 쓰는 사람에게 무료로 받은 것과 구독으로 열린 것은 <b>똑같이 "지금 쓸 수 있는 것"</b>이고,
   * 그 차이는 줄 오른쪽 칩이 이미 말한다.
   */
  const shown = packs.filter((p) => p.category === 'ANIMATED' || p.category === 'IMAGE');
  const mine = shown.filter((p) => p.usable);
  const locked = shown.filter((p) => !p.usable);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/*
          머리말 — 팩이 무엇인지 한 줄로. 상점에 처음 들어온 사람에게 "이게 왜 여기
          있는가"를 설명하는 유일한 자리다. 카드가 아니라 글이라서 스크롤하면 사라진다.
        */}
        <View style={styles.intro}>
          <Text style={styles.introTitle}>둘이 쓰는 스티커</Text>
          <Text style={styles.introText}>
            한 번 받으면 둘 다 쓸 수 있어요. 산 팩은 구독을 끊어도 그대로 남아요.
          </Text>
        </View>

        <Section title="가지고 있어요" packs={mine} onBuy={onBuy} />
        <Section title="더 있어요" packs={locked} onBuy={onBuy} />

        {loaded && shown.length === 0 && !error ? (
          <EmptyState icon="emoticon-outline" title="아직 팩이 없어요" description="곧 새 스티커가 올라와요!" />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  packs,
  onBuy,
}: {
  title: string;
  packs: StickerPack[];
  onBuy: (pack: StickerPack) => void;
}) {
  if (packs.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{packs.length}</Text>
      </View>
      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} onBuy={onBuy} />
      ))}
    </View>
  );
}

function PackCard({ pack, onBuy }: { pack: StickerPack; onBuy: (pack: StickerPack) => void }) {
  const { thumbs, count } = previewOf(pack.id);
  const meta = CATEGORY[pack.category];
  // 낱개 결제가 닫혀 있으면 카드를 누르게 두지 않는다 — 눌러서 "못 산다"를 알게 되면 늦다
  const buyable = !pack.usable && pack.price > 0 && STICKER_PURCHASE_ENABLED;

  /*
   * <b>카카오톡 이모티콘샵 목록의 모양</b>을 따른다(2026-09-22) — 왼쪽에 대표 그림 하나,
   * 가운데 이름과 설명, 오른쪽에 상태/값. 한 줄이 한 팩이고 눈은 세로로만 움직인다.
   *
   * <p>예전엔 미리보기 다섯 칸이 {@code flex: 1} 이라 <b>화면이 넓을수록 그림이 커졌다</b> —
   * 태블릿에서 한 칸이 150dp 가 되어 카드 하나가 화면 절반을 먹었다. 지금은 대표 그림도
   * 미리보기도 <b>고정 크기</b>라, 넓은 화면은 더 크게가 아니라 <b>더 많이</b> 보여준다
   * (StickerPanel.CELL_SIZE 와 같은 판단).
   *
   * <p>카드 전체가 눌린다 — 살 수 있는 팩만. 오른쪽 칩만 누르게 하면 표적이 작고, 카드를
   * 눌러도 아무 일이 없으면 "고장"으로 읽힌다. 이미 가진 팩은 Pressable 로 감싸지 않는다.
   */
  const body = (
    <>
      <View style={styles.cardHead}>
        {/* 대표 그림 — 첫 장. 팩을 알아보는 건 이름이 아니라 그림이다 */}
        {thumbs.length > 0 ? (
          <View style={styles.lead}>
            <Image source={thumbs[0]} style={styles.leadImage} resizeMode="contain" />
          </View>
        ) : (
          <View style={[styles.lead, styles.leadEmpty]}>
            <MaterialCommunityIcons name={meta.icon} size={22} color={colors.textTertiary} />
          </View>
        )}

        <View style={styles.cardTitleBox}>
          <Text style={styles.cardTitle} numberOfLines={1}>{pack.title}</Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name={meta.icon} size={12} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {meta.label}{count > 0 ? ` · ${count}개` : ''}
            </Text>
          </View>
        </View>
        <StatusChip pack={pack} />
      </View>

      {/*
        미리보기 — 대표 그림 다음 장들을 작게 한 줄로. 넘치면 잘린다(nowrap + hidden):
        몇 장이 보이는지는 화면 폭이 정하고, 전부 보여주는 것이 목적이 아니다.

        <p><b>이미 가진 팩에는 그리지 않는다</b>(2026-09-22). 미리보기는 "무엇을 사는가"에
        답하는 그림인데, 이미 가진 팩에는 그 질문이 없다 — 내용이 궁금하면 채팅 패널에서
        바로 열어 본다. 가진 팩까지 펼치면 <b>살 수 있는 팩이 목록에 파묻힌다</b>.
      */}
      {!pack.usable && thumbs.length > 1 ? (
        <View style={styles.tiles}>
          {thumbs.slice(1).map((src, i) => (
            <View key={i} style={styles.tile}>
              <Image source={src} style={styles.tileImage} resizeMode="contain" />
            </View>
          ))}
          {count > thumbs.length ? (
            <View style={[styles.tile, styles.moreTile]}>
              <Text style={styles.moreText}>+{count - thumbs.length}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </>
  );

  if (!buyable) {
    return <View style={[styles.card, !pack.usable && styles.cardLocked]}>{body}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.card, styles.cardLocked, pressed && styles.pressed]}
      onPress={() => onBuy(pack)}
      accessibilityRole="button"
      accessibilityLabel={`${pack.title} ${pack.price.toLocaleString()}원에 구매`}
    >
      {body}
    </Pressable>
  );
}

/**
 * 오른쪽 한 칸이 상태 전부다 — 무료 / 보유 / 구매함 / 가격 / PRO.
 *
 * <p>다섯을 한자리에 모으는 이유는 목록을 훑을 때 눈이 <b>한 열만</b> 따라가면 되게
 * 하기 위해서다. 상태마다 다른 자리에 두면 카드마다 눈이 다시 헤맨다.
 */
function StatusChip({ pack }: { pack: StickerPack }) {
  if (!pack.proOnly && pack.price === 0) {
    return (
      <View style={[styles.chip, styles.chipFree]}>
        <Text style={[styles.chipText, styles.chipFreeText]}>무료</Text>
      </View>
    );
  }
  if (pack.usable) {
    return (
      <View style={[styles.chip, styles.chipOwned]}>
        <MaterialCommunityIcons name="check-circle" size={12} color={colors.together} />
        <Text style={[styles.chipText, styles.chipOwnedText]}>
          {pack.purchased ? '구매완료' : '보유'}
        </Text>
      </View>
    );
  }
  if (pack.price > 0) {
    /*
     * 값은 보여주되, 아직 못 사면 그것도 같이 적는다(`STICKER_PURCHASE_ENABLED`).
     * 값만 붙여 두면 살 수 있다는 약속이 되고, 눌렀을 때 못 사면 그게 곧 배신이다.
     */
    return (
      <View style={[styles.chip, styles.chipPrice]}>
        <Text style={[styles.chipText, styles.chipPriceText]}>
          {pack.price.toLocaleString()}원{STICKER_PURCHASE_ENABLED ? '' : ' · 준비 중'}
        </Text>
      </View>
    );
  }
  // 가격이 없는 잠긴 팩 = 구독으로만 열린다. 지금 시드에는 없지만 스키마가 허용한다
  // (확장 무드·프리미엄 터치는 price = 1200 이라 위 갈래로 간다 — V96 시드)
  return (
    <View style={[styles.chip, styles.chipPro]}>
      <MaterialCommunityIcons name="crown" size={12} color={colors.primaryDark} />
      <Text style={[styles.chipText, styles.chipProText]}>PRO</Text>
    </View>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },

  intro: { gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  introTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  introText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },

  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  // 개수는 제목 옆 작은 숫자로 — pill 을 씌우면 섹션 제목보다 배지가 먼저 보인다
  sectionCount: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textTertiary },

  /*
   * 카드가 한 줄을 온전히 쓴다. 테두리 + 아주 옅은 배경으로만 구분하고 그림자를 쓰지
   * 않는다 — 카드가 여러 장 쌓이는 화면에서 그림자를 주면 목록이 울퉁불퉁해 보이고,
   * 정작 주인공인 스티커 그림과 대비가 경쟁한다.
   */
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  // 잠긴 팩은 카드 바닥을 한 톤 눌러 "아직 내 것이 아니다"를 준다 — 그림은 가리지 않는다
  cardLocked: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* 대표 그림 — 고정 56dp. 넓은 화면에서 커지지 않는다 */
  lead: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  leadEmpty: { backgroundColor: colors.surfaceAlt },
  leadImage: { width: '86%', height: '86%' },
  cardTitleBox: { flex: 1, gap: spacing.xxs },
  cardTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  metaText: { fontSize: fontSize.caption, color: colors.textTertiary, fontWeight: '600' },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: fontSize.caption, fontWeight: '800' },
  chipFree: { backgroundColor: colors.surfaceAlt },
  chipFreeText: { color: colors.textSecondary },
  chipOwned: { backgroundColor: colors.togetherBg },
  chipOwnedText: { color: colors.together },
  chipPrice: { backgroundColor: colors.primary },
  chipPriceText: { color: colors.white },
  chipPro: { backgroundColor: colors.primaryBg },
  chipProText: { color: colors.primaryDark },

  /*
   * 미리보기 타일 — <b>고정 36dp</b>다. 예전엔 {@code flex: 1} 이라 폭이 넓을수록 칸이
   * 커져(태블릿 150dp) 카드 하나가 화면 절반을 먹었다. 고정으로 두면 넓은 화면은
   * 더 많이 보여주고, 넘치는 건 잘린다(nowrap + overflow hidden).
   */
  tiles: { flexDirection: 'row', flexWrap: 'nowrap', gap: spacing.xxs, overflow: 'hidden' },
  tile: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImage: { width: '88%', height: '88%' },
  moreTile: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  moreText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
}));
