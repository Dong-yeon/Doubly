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
 * 앱이 가진 건 대표 기능의 <b>한 줄 문구</b>(아래 HIGHLIGHT_LINES)뿐이고, 무엇을 앞세울지조차
 * 서버가 정한다(`Feature.isHero()`).
 *
 * <p><b>가격도 박지 않는다.</b> 스토어가 돌려주는 표시 가격(`displayPrice`)을 그대로 쓴다.
 * 국가·통화·프로모션에 따라 달라지고, Play Console 에서 가격을 바꾸면 앱은 그대로 따라간다.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
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
import { PRO_SUBSCRIPTION_SKU, PURCHASE_ENABLED } from '../../constants/config';
import type { FeatureGroupKey, FeatureKey, PlanCatalogEntry, QuotaPeriod } from '../../types';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Plan'>;

/**
 * 구독 고지 문구 — <b>애플 심사 지침 3.1.2 가 앱 <u>화면 안</u>에 요구하는 것</b>이다.
 * 제목 · 기간 · 가격 · 자동 갱신 · 해지 방법 · 이용약관/개인정보처리방침 링크.
 *
 * <p>2026-09-17 반려로 확인했다. 그때 걸린 것은 스토어 <b>메타데이터</b>(앱 설명에 EULA
 * 링크가 없다)였지만, 같은 지침이 앱 안에도 같은 항목을 요구한다 — 메타데이터를 고쳐
 * 재심사에 넣으면 다음 차례로 이게 걸린다. docs/APP_STORE_BILLING.md 참고.
 *
 * <p>해지 경로는 스토어마다 다르므로 갈라 적는다. "앱에서 해지"라고 쓰면 거짓말이 된다 —
 * 자동 갱신 구독의 해지는 <b>스토어 계정 설정</b>에서만 된다.
 */
const CANCEL_PATH =
  Platform.OS === 'ios'
    ? '설정 → 내 이름 → 구독'
    : 'Play 스토어 → 프로필 → 결제 및 구독 → 구독';

/**
 * 스토어의 구독 관리 화면 — <b>해지가 실제로 되는 유일한 자리</b>다(위 CANCEL_PATH 주석).
 *
 * <p>앱이 구독을 직접 해지시킬 수는 없지만, 그 화면으로 <b>보내는 것</b>은 스토어가 공식으로
 * 여는 길이다. 경로를 글로만 적어두면 사용자가 설정 앱을 뒤져야 하고, 해지를 못 찾는 것은
 * 그대로 환불 요청과 별점 1점이 된다.
 *
 * <p>안드로이드는 상품을 지정해 곧장 그 구독으로 보낸다. 패키지명은 인프라와 짝이 맞아야 해서
 * 바꾸지 않기로 한 식별자다(CLAUDE.md 3절) — 여기 박아도 드리프트하지 않는다.
 *
 * <p>웹에는 두지 않는다. 어느 스토어에서 샀는지 알 수 없어 둘 중 하나로 보낼 수가 없다.
 */
const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : `https://play.google.com/store/account/subscriptions?sku=${PRO_SUBSCRIPTION_SKU}&package=com.doubly.app`;

/** 기간 — 스토어에 등록된 base plan 이 monthly 한 종류다(constants/config.ts PRO_BASE_PLAN_ID) */
const SUBSCRIPTION_PERIOD = '1개월';

/**
 * 맨 위에 세울 넷 — 기능 40개를 다 나열하면 아무것도 전달되지 않는다.
 *
 * <p>고르는 기준은 "커플 앱이라서 가능한 것". 영상통화는 이 카테고리에서 Doubly 만의
 * 차별점이고(`Feature.VIDEO_CALL` 주석), 우리 이모지는 원가가 실제로 드는 유일한 기능이며,
 * 추억·전체 통계는 <b>오래 쓴 커플일수록 가치가 커지는</b> 쪽이라 지불 의사와 곡선이 같다.
 *
 * <p>이름(`name`)은 여기 적지 않는다 — 서버 카탈로그에서 가져온다. 두 군데에 적으면 갈라진다.
 */
const HIGHLIGHT_LINES: Partial<Record<FeatureKey, string>> = {
  AI_COUPLE_EMOJI: '사진 한 장으로 우리 둘만의 이모지를',
  AI_FOOD_PHOTO: '찍기만 하면 칼로리와 영양소가 붙어요',
  WORKOUT_V2_STATS: '볼륨·1RM·부위 밸런스까지',
  VIDEO_CALL: '목소리 말고 얼굴 보면서',
  MEMORIES: '작년 오늘 우리가 뭘 했는지',
  FULL_STATS: '처음부터 지금까지 전부',
};

/**
 * 대표 기능을 <b>서버가 정한다</b>(`Feature.isHero()` → 카탈로그의 `hero`).
 *
 * <p>예전엔 여기 네 개를 박아 뒀는데, 무엇이 대표인지는 가격 정책과 함께 바뀌는 값이라
 * 앱에 박으면 바꿀 때마다 스토어 심사를 기다려야 한다 — 한도 숫자를 서버가 주는 것과
 * 같은 이유다(이 파일 맨 위 주석). 문구(`HIGHLIGHT_LINES`)만 앱에 남는다. 그건 한도가
 * 아니라 편집 판단이고, 문구가 없으면 기능 이름만으로도 줄이 성립한다.
 *
 * <p>카탈로그가 아직 안 왔거나 `hero` 를 모르는 구버전 서버면 빈 배열이 되므로,
 * 그때는 아래 폴백을 쓴다 — 결제 화면에서 혜택 목록이 통째로 비면 안 된다.
 */
const HERO_FALLBACK: FeatureKey[] = ['AI_COUPLE_EMOJI', 'AI_FOOD_PHOTO', 'WORKOUT_V2_STATS'];

function highlightsOf(catalog: PlanCatalogEntry[]): FeatureKey[] {
  const heroes = catalog.filter((e) => e.hero).map((e) => e.feature);
  return heroes.length > 0 ? heroes : HERO_FALLBACK;
}

/** 묶음 표시 순서 — 서버 enum 순서와 같게 둔다(응답 순서에 의존하지 않기 위해 명시한다) */
const GROUP_ORDER: FeatureGroupKey[] = ['AI', 'DEPTH', 'STORAGE', 'ENGAGEMENT', 'DECORATION'];

/** 하루를 밀리초로 — 남은 체험 일수 계산에 쓴다 */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 체험 종료까지 남은 일수(올림). 끝이 정해져 있지 않거나 이미 지났으면 null.
 *
 * <p><b>올림인 이유</b>: 30분 남았는데 "0일"이라고 하면 이미 끝난 것처럼 읽힌다.
 *
 * <p>서버는 모든 {@code LocalDateTime} 에 {@code Z} 를 붙여 내보내므로
 * (`JacksonConfig`) {@code new Date(iso)} 가 기기 로컬로 정확히 변환한다 —
 * 문자열을 잘라 쓰면 KST 새벽에 하루가 어긋난다(`utils/date.localDateOf` 주석 참고).
 */
function trialDaysLeft(endsAt: string | null): number | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return null;
  return Math.ceil(ms / DAY_MS);
}

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

export function PlanScreen({ navigation }: Props) {
  const plan = usePlanStore((s) => s.plan);
  const freeTrial = usePlanStore((s) => s.freeTrial);
  const trialEndsAt = usePlanStore((s) => s.trialEndsAt);
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
  // 끝이 정해진 체험(가입 후 N일)이면 남은 날을 말해 준다. 전역 체험이면 끝이 없어 null 이다.
  const daysLeft = trialDaysLeft(trialEndsAt);
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
              {daysLeft === null ? (
                <>
                  지금은 <Text style={styles.strong}>모두 체험 기간</Text>이라 PRO 기능이 전부
                  열려 있어요.
                </>
              ) : (
                <>
                  체험이 <Text style={styles.strong}>{daysLeft}일</Text> 남았어요. 그동안 아래
                  기능이 전부 열려 있어요.
                </>
              )}
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
            {highlightsOf(catalog ?? []).map((feature) => {
              const entry = byFeature.get(feature);
              if (!entry) return null;
              const line = HIGHLIGHT_LINES[feature];
              return (
                <View key={feature} style={styles.highlightRow}>
                  {/* 서브셋에 있는 글리프만 쓴다 — 새 이름은 fingerprint 입력이라 OTA 로 못 나간다
                      (docs/EAS_BUILD.md §8, LockedCard 주석과 같은 제약) */}
                  <MaterialCommunityIcons name="check-circle" size={17} color={colors.together} />
                  <View style={styles.highlightBody}>
                    <Text style={styles.highlightName}>{entry.name}</Text>
                    {line ? <Text style={styles.highlightLine}>{line}</Text> : null}
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

          {/*
            구독 고지 — 위 CANCEL_PATH 주석 참고. 구매 버튼이 없는 경우(웹)에도 그대로 둔다.
            상품 설명이지 구매 흐름의 일부가 아니고, 링크는 어디서든 닿아야 한다.
          */}
          <View style={styles.terms}>
            <Text style={styles.termsText}>
              <Text style={styles.strong}>Dubly PRO</Text> · {SUBSCRIPTION_PERIOD} 자동 갱신 구독
              {price ? ` · ${price}` : ''}
            </Text>
            <Text style={styles.termsText}>
              결제는 구매 확인 시점에 스토어 계정으로 청구돼요. 기간이 끝나기 24시간 전까지
              해지하지 않으면 같은 금액으로 자동 갱신되고, 갱신 요금은 기간 만료 24시간 이내에
              청구돼요.
            </Text>
            <Text style={styles.termsText}>
              해지는 <Text style={styles.strong}>{CANCEL_PATH}</Text>에서 언제든 할 수 있어요.
              해지해도 남은 기간 동안은 PRO가 유지돼요.
            </Text>
            {Platform.OS === 'web' ? null : (
              <Pressable
                onPress={() =>
                  Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() =>
                    toast.error('구독 관리 화면을 열 수 없어요.'),
                  )
                }
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="스토어 구독 관리 화면 열기"
              >
                <Text style={styles.termsLink}>구독 관리 열기</Text>
              </Pressable>
            )}
            <View style={styles.termsLinks}>
              <Pressable
                onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
                hitSlop={8}
                accessibilityRole="link"
              >
                <Text style={styles.termsLink}>이용약관</Text>
              </Pressable>
              <Text style={styles.termsDot}>·</Text>
              <Pressable
                onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
                hitSlop={8}
                accessibilityRole="link"
              >
                <Text style={styles.termsLink}>개인정보처리방침</Text>
              </Pressable>
            </View>
          </View>
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

  // 구독 고지 — 읽히되 소개를 가리지 않게 한 단계 작고 흐리게
  terms: { gap: spacing.xs, marginTop: spacing.xs },
  termsText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  termsLinks: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xxs },
  termsLink: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    color: colors.together,
    textDecorationLine: 'underline',
  },
  termsDot: { fontSize: fontSize.caption, color: colors.textSecondary },

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
