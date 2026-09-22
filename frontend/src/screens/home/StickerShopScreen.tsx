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
 * <p><b>그림이 주인공인 화면이다.</b> 목록형 한 줄짜리로 만들었다가 고쳤다 — 스티커를
 * 44px 썸네일로 늘어놓으면 표정이 안 보여서 <b>무엇을 사는지가 안 읽힌다</b>. 이모티콘
 * 패널이 칸 수를 8 → 5 → 6 으로 옮겨 다니며 배운 것과 같다(`StickerPanel` 주석:
 * "48px 로 그려지는 그림은 32px 와 달리 표정이 읽힌다"). 그래서 카드 하나가 한 줄을
 * 온전히 쓰고, 미리보기 타일이 그 안에서 가장 큰 요소다.
 *
 * <p><b>결제는 아직 안 붙었다.</b> 스토어 콘솔에 일회성 상품을 등록해야 이을 수 있다.
 * 지금 유료 팩을 누르면 안내만 뜬다 — 그 자리가 `onBuy` 이고, 콘솔 등록 뒤
 * `stickerApi.verifyGoogle/verifyApple` 로 이으면 된다.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { stickerApi } from '../../api/stickers';
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
   * 무료 → 열림 → 잠김 순. 살 것을 맨 아래 두는 게 아니라 <b>받을 수 있는 것을 먼저</b>
   * 보여준다 — 상점에 들어오자마자 값부터 보이면 둘러볼 마음이 사라진다.
   */
  const free = packs.filter((p) => !p.proOnly && p.price === 0);
  const owned = packs.filter((p) => (p.proOnly || p.price > 0) && p.usable);
  const locked = packs.filter((p) => (p.proOnly || p.price > 0) && !p.usable);

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

        <Section title="가지고 있어요" packs={free} onBuy={onBuy} />
        <Section title="열려 있어요" packs={owned} onBuy={onBuy} />
        <Section title="더 있어요" packs={locked} onBuy={onBuy} />

        {loaded && packs.length === 0 && !error ? (
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
  const buyable = !pack.usable && pack.price > 0;

  /*
   * 카드 전체가 눌린다 — 살 수 있는 팩만. 오른쪽 버튼만 누르게 하면 표적이 작고,
   * 카드를 눌러도 아무 일이 없으면 "고장"으로 읽힌다. 이미 가진 팩은 누를 일이 없으므로
   * Pressable 로 감싸지 않는다(눌리는 것처럼 보이는 게 더 나쁘다).
   */
  const body = (
    <>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleBox}>
          <Text style={styles.cardTitle} numberOfLines={1}>{pack.title}</Text>
          <View style={styles.metaRow}>
            <MaterialCommunityIcons name={meta.icon} size={13} color={colors.textTertiary} />
            <Text style={styles.metaText}>
              {meta.label}{count > 0 ? ` · ${count}개` : ''}
            </Text>
          </View>
        </View>
        <StatusChip pack={pack} />
      </View>

      {thumbs.length > 0 ? (
        <View style={styles.tiles}>
          {thumbs.map((src, i) => (
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
          {pack.purchased ? '구매함' : '보유'}
        </Text>
      </View>
    );
  }
  if (pack.price > 0) {
    return (
      <View style={[styles.chip, styles.chipPrice]}>
        <Text style={[styles.chipText, styles.chipPriceText]}>{pack.price.toLocaleString()}원</Text>
      </View>
    );
  }
  // 가격이 없는 잠긴 팩 = 구독으로만 열린다(확장 무드·프리미엄 터치)
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  // 잠긴 팩은 카드 바닥을 한 톤 눌러 "아직 내 것이 아니다"를 준다 — 그림은 가리지 않는다
  cardLocked: { backgroundColor: colors.surfaceAlt },
  pressed: { opacity: 0.7 },

  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  cardTitleBox: { flex: 1, gap: spacing.xxs },
  cardTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
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
   * 미리보기 타일 — 카드에서 가장 큰 요소다. 한 줄 6칸이 아니라 <b>5칸 + 더보기</b>로
   * 두는 이유는 칸을 키워 표정이 읽히게 하기 위해서다(`StickerPanel` 이 같은 이유로
   * 48px 를 지킨다). 짝 스티커는 가로가 넓어 contain 이 세로를 덜 채우므로, 타일에
   * 옅은 배경을 깔아 줄이 흔들리지 않게 한다.
   */
  tiles: { flexDirection: 'row', gap: spacing.xs },
  tile: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileImage: { width: '88%', height: '88%' },
  moreTile: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  moreText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
}));
