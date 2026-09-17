/**
 * 플랜 (PLAN-01) — FREE 와 PRO 가 무엇이 다른지 한 자리에서 보여준다.
 *
 * <p><b>왜 필요한가</b>: 이 앱의 업그레이드 유도는 전부 <b>반응형</b>이었다 — 잠긴 카드를
 * 누르거나 한도에 부딪혔을 때만 시트가 뜬다(`components/UpgradeSheet`). 그래서 사용자는
 * 막힌 기능 하나만 보고 PRO 전체가 무엇인지는 끝까지 모른다. 한도 소진 알림은 있는데
 * 상품 소개가 없었다. docs/PRO_UPSELL_AND_ADS_2026-09-17.md §2·§6.
 *
 * <p><b>숫자는 전부 서버가 준다</b>(`GET /plan/catalog`). 여기에 "사진 60장"을 박아두면
 * 한도를 조정할 때마다 스토어 심사를 기다려야 한다 — `FeatureState` 주석과 같은 이유다.
 * 앱이 가진 건 <b>무엇을 앞세울지</b>(아래 HIGHLIGHTS)뿐이고, 그건 한도가 아니라 편집 판단이다.
 *
 * <p><b>가격도 박지 않는다.</b> 스토어가 돌려주는 표시 가격(`displayPrice`)을 그대로 쓴다.
 * 국가·통화·프로모션에 따라 달라지고, Play Console 에서 가격을 바꾸면 앱은 그대로 따라간다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Card } from '../../components/Card';
import { MaterialCommunityIcons } from '../../components/Icon';
import { planApi } from '../../api/plan';
import { usePlanStore } from '../../store/planStore';
import { useAuthStore } from '../../store/authStore';
import { fetchProSubscription, requestProPurchase } from '../../utils/iap';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { PURCHASE_ENABLED } from '../../constants/config';
import type { FeatureGroupKey, FeatureKey, PlanCatalogEntry, QuotaPeriod } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Plan'>;

/**
 * 맨 위에 세울 넷 — 기능 40개를 다 나열하면 아무것도 전달되지 않는다.
 *
 * <p>고르는 기준은 "커플 앱이라서 가능한 것". 영상통화는 이 카테고리에서 Doubly 만의
 * 차별점이고(`Feature.VIDEO_CALL` 주석), 우리 이모지는 원가가 실제로 드는 유일한 기능이며,
 * 추억·전체 통계는 <b>오래 쓴 커플일수록 가치가 커지는</b> 쪽이라 지불 의사와 곡선이 같다.
 *
 * <p>이름(`name`)은 여기 적지 않는다 — 서버 카탈로그에서 가져온다. 두 군데에 적으면 갈라진다.
 */
const HIGHLIGHTS: { feature: FeatureKey; line: string }[] = [
  { feature: 'VIDEO_CALL', line: '목소리 말고 얼굴 보면서' },
  { feature: 'AI_COUPLE_EMOJI', line: '사진 한 장으로 우리 둘만의 이모지를' },
  { feature: 'MEMORIES', line: '작년 오늘 우리가 뭘 했는지' },
  { feature: 'FULL_STATS', line: '처음부터 지금까지 전부' },
];

/** 묶음 표시 순서 — 서버 enum 순서와 같게 둔다(응답 순서에 의존하지 않기 위해 명시한다) */
const GROUP_ORDER: FeatureGroupKey[] = ['AI', 'DEPTH', 'STORAGE', 'ENGAGEMENT', 'DECORATION'];

/** 한도 한 칸의 문구. -1 무제한, 0 은 "못 씀"이라 숫자를 쓰지 않는다. */
function limitLabel(limit: number, period: QuotaPeriod): string {
  if (limit < 0) return '무제한';
  if (limit === 0) return '—';
  switch (period) {
    case 'DAY':
      return `하루 ${limit}회`;
    case 'WEEK':
      return `주 ${limit}회`;
    case 'MONTH':
      return `월 ${limit}회`;
    // 개수형은 리셋되지 않는다 — "회"가 아니라 "개"다(지우면 다시 만들 수 있다).
    case 'TOTAL':
      return `${limit}개`;
    case 'NONE':
      return `${limit}`;
  }
}

export function PlanScreen(_props: Props) {
  const plan = usePlanStore((s) => s.plan);
  const freeTrial = usePlanStore((s) => s.freeTrial);
  const userId = useAuthStore((s) => s.user?.id);

  const [catalog, setCatalog] = useState<PlanCatalogEntry[] | null>(null);
  const [price, setPrice] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    planApi
      .catalog()
      .then(setCatalog)
      .catch(() => setCatalog([]));
  }, []);

  /*
   * 가격은 스토어에 물어본다. 실패하면(웹·스토어 미연결·상품 비활성) 그냥 안 보여준다 —
   * 여기서 "4,900원" 같은 값을 폴백으로 쓰면 실제 청구액과 다를 때 그게 거짓말이 된다.
   */
  useEffect(() => {
    if (!PURCHASE_ENABLED) return;
    void fetchProSubscription().then((product) => setPrice(product?.displayPrice ?? null));
  }, []);

  const onPurchase = useCallback(async () => {
    if (!userId || purchasing) return;
    setPurchasing(true);
    try {
      await requestProPurchase(userId);
    } catch (e) {
      toast.error(getErrorMessage(e, '결제를 시작하지 못했어요. 잠시 후 다시 시도해주세요.'));
    } finally {
      setPurchasing(false);
    }
  }, [userId, purchasing]);

  const isPro = plan === 'PRO';
  /*
   * <b>"PRO 다"와 "결제했다"는 다르다.</b> 무료 체험 기간에는 전원 PRO 로 판정되므로
   * (`PlanResolver` — fitto.plan.free-trial), isPro 만 보고 버튼을 잠그면 <b>아무도 결제할
   * 수 없다</b>. 결제 흐름을 테스트할 방법도 같이 사라진다.
   *
   * 체험이 끝난 뒤의 PRO 는 누군가 돈을 낸 것이거나(본인 또는 상대) 수동 부여다 —
   * 그때는 결제를 다시 권하지 않는다.
   */
  const alreadySubscribed = isPro && !freeTrial;
  const byFeature = new Map((catalog ?? []).map((entry) => [entry.feature, entry]));
  const hasCoupleScoped = (catalog ?? []).some((entry) => entry.coupleScoped);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 지금 내 상태 — 무엇을 팔기 전에 어디 서 있는지부터 말한다 */}
        <Card elevation="sm" style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>지금 플랜</Text>
            <View style={[styles.planBadge, isPro && styles.planBadgePro]}>
              <Text style={[styles.planBadgeText, isPro && styles.planBadgeTextPro]}>
                {isPro ? 'PRO' : 'FREE'}
              </Text>
            </View>
          </View>
          {freeTrial ? (
            <Text style={styles.statusNote}>
              지금은 <Text style={styles.strong}>모두 체험 기간</Text>이라 PRO 기능이 전부 열려 있어요.
            </Text>
          ) : null}
        </Card>

        {/* PRO 소개 — 넷만 앞세운다 */}
        <Card elevation="sm" style={styles.pitchCard}>
          <Text style={styles.pitchTitle}>PRO로 더 넉넉하게</Text>
          <Text style={styles.pitchLead}>
            둘 중 <Text style={styles.strong}>한 명만 결제하면 둘 다</Text> PRO예요.
          </Text>

          <View style={styles.highlights}>
            {HIGHLIGHTS.map(({ feature, line }) => {
              const entry = byFeature.get(feature);
              if (!entry) return null;
              return (
                <View key={feature} style={styles.highlightRow}>
                  {/* 서브셋에 있는 글리프만 쓴다 — 새 이름은 fingerprint 입력이라 OTA 로 못 나간다
                      (docs/EAS_BUILD.md §8, LockedCard 주석과 같은 제약) */}
                  <MaterialCommunityIcons name="check-circle" size={17} color={colors.together} />
                  <View style={styles.highlightBody}>
                    <Text style={styles.highlightName}>{entry.name}</Text>
                    <Text style={styles.highlightLine}>{line}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {price ? <Text style={styles.price}>{price} / 월</Text> : null}

          {PURCHASE_ENABLED ? (
            <Pressable
              style={({ pressed }) => [styles.primary, (pressed || purchasing) && styles.pressed]}
              onPress={onPurchase}
              disabled={purchasing || alreadySubscribed}
              accessibilityRole="button"
            >
              {purchasing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>
                  {alreadySubscribed ? '이미 PRO예요' : 'PRO 시작하기'}
                </Text>
              )}
            </Pressable>
          ) : (
            /* 없는 구매 흐름으로 보내면 막다른 길이 된다 — UpgradeSheet 와 같은 판단 */
            <View style={styles.notice}>
              <Text style={styles.noticeText}>PRO는 준비 중이에요. 곧 만나요!</Text>
            </View>
          )}
        </Card>

        {/* 전체 비교 */}
        {catalog === null ? (
          <ActivityIndicator style={styles.loading} color={colors.together} />
        ) : (
          GROUP_ORDER.map((group) => {
            const rows = catalog.filter((entry) => entry.group === group);
            if (rows.length === 0) return null;
            return (
              <View key={group} style={styles.group}>
                <Text style={styles.groupTitle}>{rows[0].groupName}</Text>
                <Card elevation="sm" style={styles.table}>
                  <View style={[styles.row, styles.headRow]}>
                    <Text style={[styles.cellName, styles.headText]}>기능</Text>
                    <Text style={[styles.cellLimit, styles.headText]}>FREE</Text>
                    <Text style={[styles.cellLimit, styles.headText]}>PRO</Text>
                  </View>
                  {rows.map((entry, i) => (
                    <View key={entry.feature} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <Text style={styles.cellName} numberOfLines={2}>
                        {entry.name}
                        {entry.coupleScoped ? <Text style={styles.mark}> *</Text> : null}
                      </Text>
                      <Text style={[styles.cellLimit, entry.freeLimit === 0 && styles.muted]}>
                        {limitLabel(entry.freeLimit, entry.freePeriod)}
                      </Text>
                      <Text style={[styles.cellLimit, styles.proValue]}>
                        {limitLabel(entry.proLimit, entry.proPeriod)}
                      </Text>
                    </View>
                  ))}
                </Card>
              </View>
            );
          })
        )}

        {hasCoupleScoped ? (
          <Text style={styles.footnote}>
            * 표시된 한도는 <Text style={styles.strong}>둘이 함께</Text> 쓰는 양이에요.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  statusCard: { padding: spacing.md, gap: spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  planBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  planBadgePro: { backgroundColor: colors.togetherBg },
  planBadgeText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  planBadgeTextPro: { color: colors.together },
  statusNote: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },

  pitchCard: { padding: spacing.md, gap: spacing.sm },
  pitchTitle: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  pitchLead: { fontSize: fontSize.body, color: colors.textSecondary },
  strong: { fontWeight: '800', color: colors.textPrimary },

  highlights: { gap: spacing.sm, marginTop: spacing.xs },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  highlightBody: { flex: 1 },
  highlightName: { fontSize: fontSize.body, fontWeight: '700', color: colors.textPrimary },
  highlightLine: { fontSize: fontSize.caption, color: colors.textSecondary, marginTop: 1 },

  price: {
    fontSize: fontSize.subtitle,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  primary: {
    backgroundColor: colors.together,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  primaryText: { color: '#FFFFFF', fontSize: fontSize.body, fontWeight: '800' },
  pressed: { opacity: 0.85 },
  notice: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  noticeText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },

  loading: { marginTop: spacing.lg },
  group: { gap: spacing.xs },
  groupTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  table: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  headRow: { paddingBottom: spacing.xs },
  headText: { fontSize: fontSize.caption, fontWeight: '800', color: colors.textSecondary },
  cellName: { flex: 1, fontSize: fontSize.caption, color: colors.textPrimary, paddingRight: spacing.xs },
  cellLimit: { width: 78, fontSize: fontSize.caption, color: colors.textSecondary, textAlign: 'right' },
  proValue: { color: colors.together, fontWeight: '700' },
  muted: { color: colors.textTertiary },
  mark: { color: colors.textTertiary },
  footnote: { fontSize: fontSize.caption, color: colors.textSecondary, marginLeft: spacing.xs },
}));
