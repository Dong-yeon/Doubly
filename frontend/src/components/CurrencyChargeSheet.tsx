/**
 * 유료 재화 충전 시트 — 스토어에 등록된 묶음을 양이 작은 것부터 보여 주고, 고르면 결제창을 연다.
 *
 * <p>결제 결과는 이 시트가 아니라 utils/iap.ts 의 리스너가 받는다(검증 → 지갑 반영 → 소비 → 잔액 재조회 → 토스트).
 * 그래서 결제창을 연 뒤에는 시트를 닫는다 — 잔액은 스토어(useCurrencyStore)를 보는 화면이 저절로 갱신한다.
 * 가격 문자열은 스토어의 displayPrice 그대로다(앱이 금액을 계산하지 않는다).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Product } from 'react-native-iap';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { useAuthStore } from '../store/authStore';
import { useCurrencyStore } from '../store/currencyStore';
import { toast } from '../store/toastStore';
import { fetchCurrencyPacks, requestCurrencyPurchase } from '../utils/iap';
import { getErrorMessage } from '../utils/error';
import { CURRENCY_NAME, currencyAmountOf } from '../constants/currency';
import { colors, fontSize, spacing } from '../constants/theme';
import { themedStyles } from '../theme/themedStyles';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 무엇 때문에 여는지 — 예: "우리 이모지 한 세트는 39개예요" */
  reason?: string;
}

export function CurrencyChargeSheet({ visible, onClose, reason }: Props) {
  const userId = useAuthStore((s) => s.user?.id);
  const balance = useCurrencyStore((s) => s.balance);
  const [packs, setPacks] = useState<Product[] | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void fetchCurrencyPacks().then((list) => {
      if (alive) setPacks(list);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const buy = async (productId: string) => {
    if (!userId || buying) return;
    setBuying(productId);
    try {
      await requestCurrencyPurchase(userId, productId);
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e, '결제를 시작하지 못했어요. 잠시 후 다시 시도해주세요.'));
    } finally {
      setBuying(null);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} position="bottom">
      <Text style={styles.title}>{CURRENCY_NAME} 충전</Text>
      {reason ? <Text style={styles.hint}>{reason}</Text> : null}
      <Text style={styles.balance}>
        지금 {CURRENCY_NAME} {balance ?? 0}개
        {balance != null && balance < 0 ? ' — 환불된 결제만큼 갚아야 쓸 수 있어요' : ''}
      </Text>
      {packs == null ? (
        <ActivityIndicator style={styles.loading} color={colors.textSecondary} />
      ) : packs.length === 0 ? (
        <Text style={styles.hint}>지금은 충전할 수 있는 상품이 없어요. 잠시 후 다시 확인해 주세요.</Text>
      ) : (
        <View style={styles.list}>
          {packs.map((p) => (
            <Button
              key={p.id}
              title={`${CURRENCY_NAME} ${currencyAmountOf(p.id)}개 · ${p.displayPrice}`}
              variant="secondary"
              size="md"
              loading={buying === p.id}
              disabled={!!buying && buying !== p.id}
              onPress={() => void buy(p.id)}
            />
          ))}
        </View>
      )}
      <Text style={styles.fine}>
        {/* 이름 뒤에 조사를 붙이지 않는다 — 이름이 가칭이라 "은/는"이 바뀔 수 있다 */}
        {CURRENCY_NAME} 안내 · 결제로만 충전돼요 · 앱 안 상품(우리 이모지 세트 등)을 살 때 써요 · 충전한 사람만 쓸 수 있어요
      </Text>
    </Sheet>
  );
}

const styles = themedStyles((c) => ({
  title: { fontSize: fontSize.subtitle, fontWeight: '700' as const, color: c.textPrimary, marginBottom: spacing.xs },
  hint: { fontSize: fontSize.caption, color: c.textSecondary, marginBottom: spacing.sm },
  balance: { fontSize: fontSize.body, color: c.textPrimary, marginBottom: spacing.md },
  loading: { marginVertical: spacing.lg },
  list: { gap: spacing.sm, marginBottom: spacing.md },
  fine: { fontSize: fontSize.micro, color: c.textSecondary },
}));
