/**
 * Dubly Plus — 1개월·1년(자동 갱신 구독)·영구(1회 결제) 중 하나를 고르는 화면(docs/DUBLY_PLUS_PLAN_2026-10-14.md S4).
 *
 * <p><b>세 상품의 내용은 같다: 광고 제거, 커플 한 명이 사면 둘 다.</b> 그래서 예전 비교표(FREE/PRO 한도 30줄)는 없다 —
 * 기능 한도는 한 등급이 되어 모두에게 같다(서버 `PlanProperties.singleTier`). 고르는 것은 기간뿐이고, 가성비는
 * 1개월 < 1년 < 영구 순이다. 우리 이모지처럼 원가가 드는 것은 크라운으로 따로 판다.
 *
 * <p><b>가격은 박지 않는다.</b> 스토어가 돌려주는 표시 가격(`displayPrice`)을 그대로 쓰고, 1년 절약률도 두 가격으로 계산한다.
 * 스토어에 없는 상품은 카드를 그리지 않는다(콘솔 등록 전에도 안전하다).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../../navigation/types';
import { Button } from '../../components/Button';
import { MaterialCommunityIcons } from '../../components/Icon';
import { usePlanStore } from '../../store/planStore';
import { useAuthStore } from '../../store/authStore';
import { useRelationStore } from '../../store/relationStore';
import {
  fetchLifetimeProduct,
  fetchProSubscriptions,
  requestLifetimePurchase,
  requestProPurchase,
  restorePurchases,
} from '../../utils/iap';
import { analyticsApi } from '../../api/analytics';
import { toast } from '../../store/toastStore';
import { getErrorMessage } from '../../utils/error';
import { PRO_SUBSCRIPTION_SKUS, PURCHASE_ENABLED, type ProTerm } from '../../constants/config';
import { colors, fontSize, radius, spacing } from '../../constants/theme';
import { themedStyles } from '../../theme/themedStyles';

type Props = NativeStackScreenProps<HomeStackParamList, 'Plan'>;

/** 고를 수 있는 셋 — 구독 둘(기존 pro_monthly·pro_yearly)과 영구(plus_lifetime) */
type Choice = ProTerm | 'lifetime';

/**
 * 구독 고지 — <b>애플 심사 지침 3.1.2 가 앱 <u>화면 안</u>에 요구하는 것</b>(제목·기간·가격·자동 갱신·해지 방법·약관 링크).
 * 해지 경로는 스토어마다 다르므로 갈라 적는다 — 자동 갱신 구독의 해지는 <b>스토어 계정 설정</b>에서만 된다.
 * 영구(비소모성)에는 해당하지 않는다.
 */
const CANCEL_PATH =
  Platform.OS === 'ios'
    ? '설정 → 내 이름 → 구독'
    : 'Play 스토어 → 프로필 → 결제 및 구독 → 구독';

/** 스토어의 구독 관리 화면 — 해지가 실제로 되는 유일한 자리. 기존 구독자가 남아 있는 한 링크를 둔다 */
const MANAGE_SUBSCRIPTION_URL =
  Platform.OS === 'ios'
    ? 'https://apps.apple.com/account/subscriptions'
    : `https://play.google.com/store/account/subscriptions?sku=${PRO_SUBSCRIPTION_SKUS.monthly}&package=com.doubly.app`;

const CHOICE_TITLE: Record<Choice, string> = { monthly: '1개월', yearly: '1년', lifetime: '영구' };

/** 머리 띠의 캐릭터 — 스티커 자산 재사용 */
const HERO_DUO = require('../../../assets/stickers/duo_love.png');

interface PriceInfo {
  display: string;
  amount?: number;
}

export function PlanScreen({ navigation }: Props) {
  const planKnown = usePlanStore((s) => s.isLoaded);
  const adFreeSource = usePlanStore((s) => s.adFreeSource);
  const lifetimeOwned = usePlanStore((s) => s.lifetimeOwned);
  const partnerName = useRelationStore((s) => s.couple?.partner?.name) ?? '상대';
  const userId = useAuthStore((s) => s.user?.id);

  const [prices, setPrices] = useState<Partial<Record<Choice, PriceInfo>>>({});
  const [choice, setChoice] = useState<Choice | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  /*
   * 들어올 때마다 내 플랜을 다시 읽는다 — 상대가 방금 샀는데 이 화면이 그대로면 둘이 같은 것을 두 번 산다
   * (docs/first-experience-audit.md #14).
   */
  useFocusEffect(
    useCallback(() => {
      void usePlanStore.getState().load();
    }, []),
  );

  /*
   * 가격은 스토어에 물어본다. 실패하면(웹·스토어 미연결·상품 비활성) 그 카드를 그리지 않는다 — "19,000원" 같은 폴백을
   * 쓰면 실제 청구액과 다를 때 거짓말이 된다. 기본 선택은 가장 이득인 것(영구 → 1년 → 1개월).
   */
  useEffect(() => {
    analyticsApi.log('PAYWALL_VIEWED', 'plan_screen').catch(() => {});
    if (!PURCHASE_ENABLED) return;
    void Promise.all([fetchProSubscriptions(), fetchLifetimeProduct()]).then(([subs, lifetime]) => {
      const next: Partial<Record<Choice, PriceInfo>> = {};
      (['monthly', 'yearly'] as ProTerm[]).forEach((t) => {
        const product = subs[t];
        if (product) next[t] = { display: product.displayPrice, amount: typeof product.price === 'number' ? product.price : undefined };
      });
      if (lifetime) next.lifetime = { display: lifetime.displayPrice, amount: typeof lifetime.price === 'number' ? lifetime.price : undefined };
      setPrices(next);
      setChoice((current) => current ?? (next.lifetime ? 'lifetime' : next.yearly ? 'yearly' : next.monthly ? 'monthly' : null));
    });
  }, []);

  /*
   * 지금 무엇으로 광고가 없나. 상대 덕분이면 결제를 권하지 않는다 — 한 명이 사면 둘 다다.
   * 본인 구독 중이면 구독은 더 살 수 없고 영구로 바꾸는 길만 연다(영구를 산 뒤 구독은 스토어에서 해지).
   */
  const coveredByPartner = adFreeSource === 'PARTNER';
  const subscribed = adFreeSource === 'SELF_SUBSCRIPTION';
  const owned = lifetimeOwned || adFreeSource === 'SELF_LIFETIME';
  const purchasable = (c: Choice): boolean => {
    if (!planKnown || owned || coveredByPartner) return false;
    if (subscribed) return c === 'lifetime';
    return true;
  };

  const statusTag = owned
    ? '영구 이용 중 · 우리 둘 다 광고 없이'
    : subscribed
      ? '구독 이용 중 · 우리 둘 다 광고 없이'
      : coveredByPartner
        ? `${partnerName}님 덕분에 광고 없이 쓰는 중`
        : null;

  // 1년이 1개월 12번보다 얼마나 싼가 — 두 숫자 가격이 다 있을 때만(지어낸 숫자 금지)
  const yearlySaving =
    prices.monthly?.amount && prices.yearly?.amount
      ? Math.round((1 - prices.yearly.amount / (prices.monthly.amount * 12)) * 100)
      : null;
  const yearlyPerMonth =
    prices.yearly?.amount != null ? `월 ${Math.round(prices.yearly.amount / 12).toLocaleString('ko-KR')}원` : null;

  const choices = (['monthly', 'yearly', 'lifetime'] as Choice[]).filter((c) => !!prices[c]);
  const selected = choice && prices[choice] && purchasable(choice) ? choice : null;

  const onPurchase = useCallback(async () => {
    if (!userId || purchasing || !selected) return;
    setPurchasing(true);
    try {
      if (selected === 'lifetime') await requestLifetimePurchase(userId);
      else await requestProPurchase(userId, selected);
    } catch (e) {
      toast.error(getErrorMessage(e, '결제를 시작하지 못했어요. 잠시 후 다시 시도해주세요.'));
    } finally {
      setPurchasing(false);
    }
  }, [userId, purchasing, selected]);

  /* 구매 복원 — 기기 교체·재설치 뒤 영구권·구독을 되찾는 길(애플 3.1.1). 결과를 말한다 */
  const onRestore = useCallback(async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result === 'none') toast.info('이 스토어 계정에 복원할 구매가 없어요.');
      else if (result === 'error') toast.error('스토어에 연결하지 못했어요. 잠시 후 다시 시도해주세요.');
      else if (result === 'reflected') toast.success('구매를 복원했어요.');
    } finally {
      setRestoring(false);
    }
  }, [restoring]);

  const ctaTitle = !planKnown
    ? '확인 중…'
    : owned
      ? '이미 영구로 갖고 있어요'
      : coveredByPartner
        ? `${partnerName}님 덕분에 이미 광고 없이 써요`
        : !selected
          ? subscribed
            ? '구독 이용 중이에요'
            : '상품을 골라 주세요'
          : selected === 'lifetime'
            ? `영구로 갖기 · ${prices.lifetime?.display ?? ''}`
            : `${CHOICE_TITLE[selected]} 시작하기 · ${prices[selected]?.display ?? ''}/${selected === 'yearly' ? '년' : '월'}`;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[colors.partnerBg, colors.meBg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          {statusTag ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{statusTag}</Text>
            </View>
          ) : null}
          <Image source={HERO_DUO} style={styles.heroImage} resizeMode="contain" />
          <Text style={styles.heroTitle}>Dubly Plus</Text>
          <Text style={styles.heroLead}>
            광고 없이, <Text style={styles.strong}>우리 둘 다</Text>.{'\n'}한 명만 결제하면 둘 다 광고가 사라져요.
          </Text>
        </LinearGradient>

        <View style={styles.highlights}>
          <View style={styles.highlightRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
            <Text style={styles.highlightName}>홈·기록에서 광고가 사라져요</Text>
          </View>
          <View style={styles.highlightRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
            <Text style={styles.highlightName}>한 명이 사면 우리 둘 다</Text>
          </View>
          <View style={styles.highlightRow}>
            <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} />
            <Text style={styles.highlightName}>기능은 결제 없이도 전부 그대로예요</Text>
          </View>
        </View>

        {/* 세 카드 — 스토어에 있는 것만. 고를 수 없는 카드(이미 가짐·구독 중인 구독)는 흐리게 */}
        {PURCHASE_ENABLED ? (
          <View style={styles.choices}>
            {choices.map((c) => {
              const active = selected === c;
              const enabled = purchasable(c);
              const note =
                c === 'lifetime'
                  ? '한 번 결제로 계속 · 자동 갱신 없음'
                  : c === 'yearly'
                    ? [yearlyPerMonth, yearlySaving != null && yearlySaving > 0 ? `${yearlySaving}% 절약` : null].filter(Boolean).join(' · ')
                    : '매달 자동 갱신';
              return (
                <Pressable
                  key={c}
                  onPress={() => setChoice(c)}
                  disabled={!enabled}
                  style={[styles.choice, active && styles.choiceActive, !enabled && styles.choiceDisabled]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active, disabled: !enabled }}
                  accessibilityLabel={`${CHOICE_TITLE[c]} ${prices[c]?.display ?? ''}`}
                >
                  <View style={styles.choiceHead}>
                    <Text style={[styles.choiceTitle, active && styles.choiceTitleActive]}>{CHOICE_TITLE[c]}</Text>
                    {c === 'lifetime' ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>가장 이득</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.choicePrice}>
                    {prices[c]?.display}
                    {c === 'monthly' ? <Text style={styles.choiceUnit}> /월</Text> : c === 'yearly' ? <Text style={styles.choiceUnit}> /년</Text> : null}
                  </Text>
                  {note ? <Text style={styles.choiceNote}>{note}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {PURCHASE_ENABLED ? (
          <Button
            title={ctaTitle}
            onPress={() => void onPurchase()}
            loading={purchasing}
            disabled={purchasing || !selected}
            style={styles.cta}
          />
        ) : (
          /* 없는 구매 흐름으로 보내면 막다른 길이 된다 — 웹에는 스토어가 없다 */
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Dubly Plus는 앱에서 구매할 수 있어요.</Text>
          </View>
        )}

        {/*
          고지 — 구독(3.1.2)은 자동 갱신·해지 방법을, 영구는 자동 갱신이 없다는 것을. 맨 아래, 캡션·회색.
          구매 버튼이 없는 경우(웹)에도 둔다 — 상품 설명이지 구매 흐름의 일부가 아니다.
        */}
        <View style={styles.terms}>
          <Text style={styles.termsText}>
            <Text style={styles.termsStrong}>Dubly Plus 1개월·1년</Text>은 자동 갱신 구독이에요
            {prices.monthly || prices.yearly
              ? ` (${[prices.monthly ? `1개월 ${prices.monthly.display}` : null, prices.yearly ? `1년 ${prices.yearly.display}` : null]
                  .filter(Boolean)
                  .join(' · ')})`
              : ''}
            . 결제는 구매 확인 시점에 스토어 계정으로 청구되고, 기간이 끝나기 24시간 전까지 해지하지 않으면 같은 금액으로
            자동 갱신돼요. 갱신 요금은 기간 만료 24시간 이내에 청구돼요.
          </Text>
          <Text style={styles.termsText}>
            해지는 <Text style={styles.termsStrong}>{CANCEL_PATH}</Text>에서 언제든 할 수 있어요. 해지해도 남은 기간 동안은
            광고 없이 쓸 수 있어요.
          </Text>
          <Text style={styles.termsText}>
            <Text style={styles.termsStrong}>Dubly Plus 영구</Text>는 한 번 결제하는 상품이라 자동 갱신되지 않아요
            {prices.lifetime ? ` (${prices.lifetime.display})` : ''}. 탈퇴하면 새 계정으로 옮겨지지 않아요.
          </Text>
          <View style={styles.termsLinks}>
            {Platform.OS === 'web' ? null : (
              <>
                <Pressable
                  onPress={() =>
                    Linking.openURL(MANAGE_SUBSCRIPTION_URL).catch(() => toast.error('구독 관리 화면을 열 수 없어요.'))
                  }
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel="스토어 구독 관리 화면 열기"
                >
                  <Text style={styles.termsLink}>구독 관리</Text>
                </Pressable>
                <Text style={styles.termsDot}>·</Text>
                <Pressable
                  onPress={() => void onRestore()}
                  disabled={restoring}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel="스토어 구매 복원"
                  accessibilityState={{ busy: restoring }}
                >
                  <Text style={[styles.termsLink, restoring && styles.termsLinkBusy]}>
                    {restoring ? '복원 중…' : '구매 복원'}
                  </Text>
                </Pressable>
                <Text style={styles.termsDot}>·</Text>
              </>
            )}
            <Pressable onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })} hitSlop={8} accessibilityRole="link">
              <Text style={styles.termsLink}>이용약관</Text>
            </Pressable>
            <Text style={styles.termsDot}>·</Text>
            <Pressable onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })} hitSlop={8} accessibilityRole="link">
              <Text style={styles.termsLink}>개인정보처리방침</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },

  // ── 머리 띠 ──
  hero: {
    borderRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  tag: {
    alignSelf: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  tagText: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textPrimary },
  heroImage: { width: 140, height: 140 },
  heroTitle: { fontSize: fontSize.title, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  heroLead: { fontSize: fontSize.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 21 },
  strong: { fontWeight: '800', color: colors.textPrimary },

  // ── 혜택 ──
  highlights: { gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
  highlightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  highlightName: { flex: 1, fontSize: fontSize.body, fontWeight: '600', color: colors.textPrimary },

  // ── 세 카드 — 선택 상태는 앱 전체와 같은 값(primaryBg / primary) ──
  choices: { gap: spacing.sm, marginTop: spacing.lg },
  choice: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xxs,
    backgroundColor: colors.surface,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryBg },
  choiceDisabled: { opacity: 0.45 },
  choiceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  choiceTitle: { fontSize: fontSize.caption, fontWeight: '700', color: colors.textSecondary },
  choiceTitleActive: { color: colors.textPrimary },
  choicePrice: { fontSize: fontSize.subtitle, fontWeight: '800', color: colors.textPrimary },
  choiceUnit: { fontSize: fontSize.caption, fontWeight: '600', color: colors.textSecondary },
  choiceNote: { fontSize: fontSize.micro, fontWeight: '700', color: colors.togetherText },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm, backgroundColor: colors.togetherBg },
  badgeText: { fontSize: fontSize.micro, fontWeight: '800', color: colors.togetherText },

  // ── CTA ──
  cta: { marginTop: spacing.lg },
  notice: {
    marginTop: spacing.lg,
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: { fontSize: fontSize.body, fontWeight: '700', color: colors.textSecondary },

  // ── 고지 — 읽히되 판매를 가리지 않게 맨 아래, 캡션·회색 ──
  terms: { gap: spacing.xs, marginTop: spacing.xl, paddingHorizontal: spacing.xs },
  termsText: { fontSize: fontSize.caption, color: colors.textSecondary, lineHeight: 18 },
  termsStrong: { fontWeight: '700', color: colors.textSecondary },
  termsLinks: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  termsLink: { fontSize: fontSize.caption, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },
  termsLinkBusy: { opacity: 0.5 },
  termsDot: { fontSize: fontSize.caption, color: colors.textSecondary },
}));
