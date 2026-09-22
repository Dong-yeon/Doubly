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
 * <p><b>결제는 아직 안 붙었다.</b> 스토어 콘솔에 일회성 상품을 등록해야 이을 수 있다.
 * 지금 유료 팩을 누르면 안내만 뜬다 — 그 자리가 `onBuy` 이고, 콘솔 등록 뒤
 * `stickerApi.verifyGoogle/verifyApple` 로 이으면 된다.
 */
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { stickerApi } from '../../api/stickers';
import { previewOf } from '../../constants/stickerPackPreview';
import { useStickerStore } from '../../store/stickerStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { StickerPack } from '../../types';

/** 카테고리 한국어 — 서버 enum 을 그대로 보여줄 수는 없다 */
const CATEGORY_LABEL: Record<StickerPack['category'], string> = {
  ANIMATED: '움직이는 이모티콘',
  IMAGE: '캐릭터 스티커',
  MOOD: '무드',
  TOUCH: '터치',
};

export function StickerShopScreen() {
  const packs = useStickerStore((s) => s.packs);
  const replace = useStickerStore((s) => s.replace);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /*
   * 화면에 들어올 때마다 다시 읽는다 — 스토어의 load() 는 한 번만 읽는 캐시라
   * (패널이 매번 조회하지 않게 하려고) 결제 직후 상태가 안 바뀐다. 상점은 값을 보러
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
   * 무료 → 보유 → 살 수 있는 것 순. 살 것을 맨 아래 두는 게 아니라, <b>받을 수 있는 것을
   * 먼저</b> 보여준다 — 상점에 들어오자마자 값부터 보이면 둘러볼 마음이 사라진다.
   */
  const free = packs.filter((p) => !p.proOnly && p.price === 0);
  const owned = packs.filter((p) => (p.proOnly || p.price > 0) && p.usable);
  const locked = packs.filter((p) => (p.proOnly || p.price > 0) && !p.usable);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
      <Text style={styles.sectionTitle}>{title}</Text>
      {packs.map((pack) => (
        <PackRow key={pack.id} pack={pack} onBuy={onBuy} />
      ))}
    </View>
  );
}

function PackRow({ pack, onBuy }: { pack: StickerPack; onBuy: (pack: StickerPack) => void }) {
  const { thumbs, count } = previewOf(pack.id);
  const buyable = !pack.usable && pack.price > 0;

  return (
    <Card elevation="sm" style={styles.pack}>
      <View style={styles.packHead}>
        <View style={styles.packTitleBox}>
          <Text style={styles.packTitle} numberOfLines={1}>{pack.title}</Text>
          <Text style={styles.packMeta}>
            {CATEGORY_LABEL[pack.category]}
            {count > 0 ? ` · ${count}개` : ''}
          </Text>
        </View>
        {/*
          오른쪽 한 칸이 상태 전부다 — 무료 / 보유 / 가격. 셋을 한자리에 두는 이유는
          목록을 훑을 때 눈이 한 열만 따라가면 되게 하기 위해서다.
        */}
        {pack.usable ? (
          <View style={styles.ownedBadge}>
            <MaterialCommunityIcons name="check-circle" size={13} color={colors.together} />
            <Text style={styles.ownedText}>{pack.purchased ? '구매함' : '보유'}</Text>
          </View>
        ) : buyable ? (
          <Pressable
            style={({ pressed }) => [styles.buyBtn, pressed && styles.pressed]}
            onPress={() => onBuy(pack)}
            accessibilityRole="button"
            accessibilityLabel={`${pack.title} ${pack.price.toLocaleString()}원에 구매`}
          >
            <Text style={styles.buyText}>{pack.price.toLocaleString()}원</Text>
          </Pressable>
        ) : (
          // 가격이 없는 잠긴 팩 = 구독으로만 열린다(확장 무드·프리미엄 터치)
          <View style={styles.proBadge}>
            <MaterialCommunityIcons name="crown" size={13} color={colors.primary} />
            <Text style={styles.proText}>PRO</Text>
          </View>
        )}
      </View>

      {thumbs.length > 0 ? (
        <View style={[styles.thumbRow, !pack.usable && styles.lockedThumbs]}>
          {thumbs.map((src, i) => (
            <Image key={i} source={src} style={styles.thumb} resizeMode="contain" />
          ))}
          {count > thumbs.length ? (
            <Text style={styles.more}>+{count - thumbs.length}</Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  pack: { gap: spacing.sm },
  packHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  packTitleBox: { flex: 1 },
  packTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  packMeta: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 2 },
  ownedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ownedText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.together },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  proText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.primary },
  buyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  buyText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.white },
  thumbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  // 잠긴 팩도 그림을 보여준다 — 무엇을 사는지 본 다음에 값을 읽어야 한다
  lockedThumbs: { opacity: 0.5 },
  thumb: { width: 44, height: 44 },
  more: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary, marginLeft: spacing.xxs },
  pressed: { opacity: 0.6 },
}));
