/**
 * 배너 광고 한 칸 — Dubly Plus(본인·상대)가 아닌 사람에게만 그린다(docs/DUBLY_PLUS_PLAN_2026-10-14.md S4).
 *
 * <p><b>그리지 않는 경우가 기본이다.</b> 플랜을 아직 모르거나(로드 전·조회 실패) 광고 제거 대상이면 아무것도 그리지 않고
 * 자리도 차지하지 않는다 — 결제한 사람에게 광고가 한 프레임이라도 스치는 것이 가장 나쁜 실패다. 광고를 못 받아 와도
 * (네트워크·채움률) 빈 칸을 남기지 않는다.
 *
 * <p>놓는 자리: 홈 맨 아래, 우리 기록 목록 사이. <b>채팅·게임판·결제 화면·온보딩에는 두지 않는다</b> — 커플의 사적인 흐름을
 * 끊지 않는다는 원칙. 전면 광고는 쓰지 않는다.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { usePlanStore } from '../store/planStore';
import { ensureAdsReady } from '../utils/ads';
import { bannerUnitId } from '../constants/ads';
import { fontSize, radius, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  /** "광고 없이 쓰기" — 결제 화면으로 보낸다. 없으면 링크를 그리지 않는다(그 스택에 결제 화면이 없을 때) */
  onRemoveAds?: () => void;
}

export function AdBanner({ onRemoveAds }: Props) {
  const isLoaded = usePlanStore((s) => s.isLoaded);
  const adFree = usePlanStore((s) => s.adFree);
  const show = isLoaded && !adFree;
  const [sdkReady, setSdkReady] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!show) return;
    let alive = true;
    void ensureAdsReady().then((ok) => {
      if (alive) setSdkReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [show]);

  if (!show || !sdkReady) return null;

  return (
    // 채워지기 전엔 높이 0 — 광고가 안 오면 빈 칸이 남지 않는다
    <View style={filled ? styles.box : styles.hidden}>
      <BannerAd
        unitId={bannerUnitId()}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdLoaded={() => setFilled(true)}
        onAdFailedToLoad={() => setFilled(false)}
      />
      {filled && onRemoveAds ? (
        <Pressable onPress={onRemoveAds} hitSlop={8} accessibilityRole="button" accessibilityLabel="광고 없이 쓰기">
          <Text style={styles.link}>광고 없이 쓰기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themedStyles((colors) => ({
  box: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  hidden: { height: 0, overflow: 'hidden' },
  link: { color: colors.textSecondary, fontSize: fontSize.caption, textDecorationLine: 'underline' },
}));
