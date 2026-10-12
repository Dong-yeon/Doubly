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
 * <p><b>낱개로 팔지 않는다</b>(2026-09-22, V105). 팩 하나마다 스토어 상품을 등록해야 하는데
 * — 양쪽 스토어에, 애플은 심사까지 — 유료 팩 둘짜리 앱이 감당할 비용이 아니었다.
 * 라인·카카오가 자체 캐시(코인·초코)로 그 비용을 우회하는 이유이고, 캐시는 지갑·원장·환불·
 * 약관이 딸려오는 결제 시스템 한 채다. 그래서 <b>구독 하나로 판다</b>(카카오 이모티콘 플러스와
 * 같은 자리). 지금 시드에는 값이 붙은 팩이 없으므로 이 화면에 가격표도 없다.
 *
 * <p>낱개를 다시 열 자리는 남겨 뒀다 — 팩에 {@code price} 를 주고 스토어에 상품을 등록한 뒤
 * `STICKER_PURCHASE_ENABLED` 를 켜면 값 칩과 구매 흐름이 그대로 살아난다(팩 상세의 아래 단추).
 * 백엔드 검증(`POST /stickers/purchases/google|apple`)은 손대지 않았다.
 *
 * <p><b>카드를 누르면 팩 상세로 간다</b>(2026-10-12, StickerPackDetailScreen). 그 전엔 살 수 있는
 * 팩만 눌렸는데, 낱개 판매를 닫은 뒤로는 <b>어느 카드도 눌리지 않았다</b> — 이미 가진 팩은
 * 미리보기도 접혀 있어 "안에 뭐가 들었나"를 알 길이 상점 안에 없었다.
 */
import React, { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState } from '../../components/EmptyState';
import { MaterialCommunityIcons } from '../../components/Icon';
import { stickerApi } from '../../api/stickers';
import { previewOf } from '../../constants/stickerPackPreview';
import { usePlanStore } from '../../store/planStore';
import { useRemoteStickerStore, type RemotePack } from '../../store/remoteStickerStore';
import { useStickerStore } from '../../store/stickerStore';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';
import type { HomeStackParamList } from '../../navigation/types';
import type { StickerPack } from '../../types';
import { PACK_CATEGORY, StatusChip } from './components/StickerPackStatus';

type Props = NativeStackScreenProps<HomeStackParamList, 'StickerShop'>;

export function StickerShopScreen({ navigation }: Props) {
  const packs = useStickerStore((s) => s.packs);
  const replace = useStickerStore((s) => s.replace);
  // 서버에서 받는 팩의 그림 — 이게 없으면 그 팩은 카테고리 아이콘만 선다(stickerPackPreview 주석)
  const remotePacks = useRemoteStickerStore((s) => s.packs);
  // 여기서 권하는 것(확장 무드·프리미엄 터치·우리 이모지)은 전부 커플 기능이라 상대가 결제했어도 이미 열려 있다
  const isPro = usePlanStore((s) => s.couplePlan === 'PRO');
  const showUpgrade = usePlanStore((s) => s.showUpgrade);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /*
   * 화면에 들어올 때마다 다시 읽는다 — 스토어의 load() 는 한 번만 읽는 캐시라
   * (패널이 방마다 조회하지 않게 하려고) 결제 직후 상태가 안 바뀐다. 상점은 값을 보러
   * 온 자리이므로 여기서는 항상 최신을 가져온다.
   */
  const load = useCallback(() => {
    setError(false);
    // 그림 카탈로그는 간격 제한이 걸린 캐시라 자주 불러도 된다 — 새 팩이 올라온 뒤 들어왔을 때만 실제로 묻는다
    void useRemoteStickerStore.getState().refresh();
    return stickerApi.packs()
      .then(replace)
      .catch(() => setError(true))
      .finally(() => setLoaded(true));
  }, [replace]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onOpen = (pack: StickerPack) => navigation.navigate('StickerPackDetail', { packId: pack.id });

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
            한 번 열리면 둘 다 쓸 수 있어요. 무료 팩은 그냥, 나머지는 PRO에서 열려요.
          </Text>
        </View>

        <Section title="가지고 있어요" packs={mine} remotePacks={remotePacks} onOpen={onOpen} />
        <Section title="더 있어요" packs={locked} remotePacks={remotePacks} onOpen={onOpen} />

        {/*
          PRO 안내 — 목록 아래에 한 줄. 무드·터치 팩은 여기서 고르는 물건이 아니라
          목록에서 뺐는데(위 shown 주석), 그러면 <b>PRO 가 스티커로 무엇을 주는지 말하는
          자리가 한 곳도 없어진다</b>. 구독으로만 파는 이상 그걸 모르면 팔리지 않는다.
          이미 PRO 면 권할 것이 없으므로 감춘다.
        */}
        {!isPro ? (
          <Pressable
            style={({ pressed }) => [styles.proRow, pressed && styles.pressed]}
            onPress={() =>
              showUpgrade('확장 무드와 프리미엄 터치, 우리 이모지는 PRO에서 열려요.')
            }
            accessibilityRole="button"
            accessibilityLabel="PRO 안내 보기"
          >
            <MaterialCommunityIcons name="crown" size={18} color={colors.primary} />
            <View style={styles.proBody}>
              <Text style={styles.proTitle}>PRO면 이것도 열려요</Text>
              <Text style={styles.proText}>확장 무드 · 프리미엄 터치 · 우리 이모지</Text>
            </View>
            <Text style={styles.proMore}>보기 ›</Text>
          </Pressable>
        ) : null}

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
  remotePacks,
  onOpen,
}: {
  title: string;
  packs: StickerPack[];
  remotePacks: RemotePack[];
  onOpen: (pack: StickerPack) => void;
}) {
  if (packs.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{packs.length}</Text>
      </View>
      {packs.map((pack) => (
        <PackCard key={pack.id} pack={pack} remotePacks={remotePacks} onOpen={onOpen} />
      ))}
    </View>
  );
}

function PackCard({
  pack,
  remotePacks,
  onOpen,
}: {
  pack: StickerPack;
  remotePacks: RemotePack[];
  onOpen: (pack: StickerPack) => void;
}) {
  const { thumbs, count } = previewOf(pack.id, remotePacks);
  const meta = PACK_CATEGORY[pack.category];

  /*
   * <b>카카오톡 이모티콘샵 목록의 모양</b>을 따른다(2026-09-22) — 왼쪽에 대표 그림 하나,
   * 가운데 이름과 설명, 오른쪽에 상태/값. 한 줄이 한 팩이고 눈은 세로로만 움직인다.
   *
   * <p>예전엔 미리보기 다섯 칸이 {@code flex: 1} 이라 <b>화면이 넓을수록 그림이 커졌다</b> —
   * 태블릿에서 한 칸이 150dp 가 되어 카드 하나가 화면 절반을 먹었다. 지금은 대표 그림도
   * 미리보기도 <b>고정 크기</b>라, 넓은 화면은 더 크게가 아니라 <b>더 많이</b> 보여준다
   * (StickerPanel.CELL_SIZE 와 같은 판단).
   *
   * <p>카드 전체가 눌린다 — <b>모든 팩이</b> 상세로 간다(2026-10-12). 예전엔 살 수 있는 팩만
   * 눌렸는데, 낱개 판매를 닫자 눌리는 카드가 하나도 남지 않았고 "안에 뭐가 들었나"를 볼
   * 길도 함께 사라졌다. 오른쪽 칩만 누르게 하면 표적이 작아서 카드 전체를 쓴다.
   */
  return (
    <Pressable
      style={({ pressed }) => [styles.card, !pack.usable && styles.cardLocked, pressed && styles.pressed]}
      onPress={() => onOpen(pack)}
      accessibilityRole="button"
      accessibilityLabel={`${pack.title}${count > 0 ? ` ${count}개` : ''}, 들어 있는 이모티콘 보기`}
    >
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
        <MaterialCommunityIcons name="chevron-right" size={18} color={colors.textTertiary} />
      </View>

      {/*
        미리보기 — 대표 그림 다음 장들을 작게 한 줄로. 넘치면 잘린다(nowrap + hidden):
        몇 장이 보이는지는 화면 폭이 정하고, 전부 보여주는 것이 목적이 아니다.

        <p><b>이미 가진 팩에는 그리지 않는다</b>(2026-09-22). 미리보기는 "무엇을 사는가"에
        답하는 그림인데, 이미 가진 팩에는 그 질문이 없다 — 내용이 궁금하면 카드를 눌러
        상세에서 본다. 가진 팩까지 펼치면 <b>살 수 있는 팩이 목록에 파묻힌다</b>.
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
    </Pressable>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.lg },

  intro: { gap: spacing.xxs, paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  introTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary },
  introText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },

  // PRO 안내 — 카드가 아니라 한 줄. 목록의 팩들과 경쟁하지 않게 테두리만 준다
  proRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.primaryBg,
  },
  proBody: { flex: 1, gap: 1 },
  proTitle: { fontSize: fontSize.body, fontWeight: '800', color: colors.textPrimary },
  proText: { fontSize: fontSize.caption, color: colors.textSecondary },
  proMore: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary },

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
