/**
 * Google Play/App Store 인앱결제(react-native-iap) 연동 — PRO 정기결제 하나만 다룬다.
 *
 * <p><b>결제 완료는 {@code requestPurchase()} 의 반환값이 아니라 이벤트로 온다</b>
 * (스토어 콜백 기반). 그래서 흐름이 두 갈래다.
 * <ol>
 *   <li>{@link requestProPurchase} — 결제창을 여는 요청만 보낸다. 성공 여부는 모른다</li>
 *   <li>{@link attachPurchaseListeners} — 결제 결과가 오면(성공·중복·앱 재시작 후 잔여
 *       트랜잭션까지 전부) 서버에 검증을 태우고, <b>서버가 반영한 뒤에만</b>
 *       {@code finishTransaction} 으로 스토어 트랜잭션을 닫는다. 검증 전에 먼저 닫으면
 *       실패해도 스토어 큐에서 사라져 재시도할 방법이 없다</li>
 * </ol>
 *
 * <p>사용자 계정과 구매를 연결하는 건 {@code obfuscatedAccountId}(우리 userId)다 — 서버가
 * Play Developer API로 이 값을 다시 읽어 어느 사용자 것인지 판정한다
 * (백엔드 {@code GooglePlayDeveloperApiClient} 참고). 여기서 안 실으면 서버가 구매를
 * 아무 계정에도 연결하지 못한다.
 *
 * <p>웹은 결제 SDK가 없어 전부 조용히 실패(no-op)한다.
 */
import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  getAvailablePurchases,
  requestPurchase,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  ErrorCode as IapErrorCode,
  type Purchase,
  type ProductSubscription,
  type EventSubscription,
} from 'react-native-iap';
import { planApi } from '../api/plan';
import { usePlanStore } from '../store/planStore';
import { toast } from '../store/toastStore';
import { PRO_BASE_PLAN_ID, PRO_SUBSCRIPTION_SKU } from '../constants/config';

let purchaseUpdateSub: EventSubscription | null = null;
let purchaseErrorSub: EventSubscription | null = null;

/**
 * 스토어 연결 초기화 — 앱 부팅 시 한 번(App.tsx). 리스너를 걸어두고, 앱이 죽는 바람에
 * 검증·finishTransaction 이 안 끝난 채 남은 트랜잭션이 있으면 마저 처리한다
 * (안드로이드는 미완료 트랜잭션을 3일 안에 안 닫으면 자동 환불한다).
 */
export async function initIap(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await initConnection();
    attachPurchaseListeners();
    const pending = await getAvailablePurchases();
    for (const purchase of pending ?? []) {
      await verifyAndFinish(purchase);
    }
  } catch {
    // 스토어 연결 실패 — 구매 버튼을 누를 때 다시 시도된다
  }
}

export async function endIap(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    purchaseUpdateSub?.remove();
    purchaseErrorSub?.remove();
    purchaseUpdateSub = null;
    purchaseErrorSub = null;
    await endConnection();
  } catch {
    // ignore
  }
}

function attachPurchaseListeners(): void {
  if (purchaseUpdateSub) return; // 중복 등록 방지
  purchaseUpdateSub = purchaseUpdatedListener((purchase) => {
    void verifyAndFinish(purchase);
  });
  purchaseErrorSub = purchaseErrorListener((error) => {
    // 사용자가 결제창을 취소한 건 실패가 아니다 — 조용히 넘어간다
    if (error.code === IapErrorCode.UserCancelled) return;
    toast.error('결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요.');
  });
}

/**
 * userId → 애플 {@code appAccountToken}(UUID).
 *
 * <p>애플은 구매에 실을 수 있는 사용자 식별자로 <b>UUID 하나만</b> 받는다(구글의
 * {@code obfuscatedAccountId} 는 임의 문자열이라 userId 를 그대로 넣었다). 그래서 숫자 id 를
 * UUID 하위 비트에 넣고 상위는 0 으로 둔다 — 서버가 되읽어 사용자에 연결한다.
 *
 * <p><b>서버의 {@code AppAccountTokens} 와 규칙이 같아야 한다.</b> 어긋나면 결제가 아무
 * 계정에도 붙지 않고, 증상은 "결제는 됐는데 PRO 가 안 열림" 하나뿐이다.
 * (Java 쪽은 {@code new UUID(0L, userId)} 이고, 그 toString 이 아래와 같은 모양이다.)
 */
function appAccountTokenOf(userId: number): string {
  return `00000000-0000-0000-0000-${userId.toString(16).padStart(12, '0')}`;
}

/** PRO 구독 상품 정보 — 가격 표시, 안드로이드 결제 요청에 필요한 offerToken 조회용. */
export async function fetchProSubscription(): Promise<ProductSubscription | null> {
  if (Platform.OS === 'web') return null;
  try {
    const products = await fetchProducts({ skus: [PRO_SUBSCRIPTION_SKU], type: 'subs' });
    const list = Array.isArray(products) ? (products as ProductSubscription[]) : [];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * PRO 구독 결제창을 연다. 실제 결제 성공/실패는 {@link attachPurchaseListeners} 로 온다 —
 * 이 함수가 끝났다고 결제가 끝난 게 아니다(결제창을 여는 요청을 보냈을 뿐).
 */
export async function requestProPurchase(userId: number): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('웹에서는 인앱결제를 지원하지 않아요.');
  }

  const product = await fetchProSubscription();
  /*
   * 기본 요금제를 <b>id 로 골라야 한다</b> — 예전엔 subscriptionOffers[0] 을 그냥 집었는데,
   * 한 상품 아래 기본 요금제가 여럿이면(현재 monthly/base 둘) 청구 주기가 Play 가 주는
   * 순서에 달리게 된다. 월 구독을 누른 사람이 주 단위로 빠져나가는 건 되돌리기 어렵다.
   * 못 찾으면 결제를 시작하지 않는다 — 다른 요금제를 조용히 파느니 실패하는 게 낫다.
   */
  const offerToken =
    product?.subscriptionOffers?.find((offer) => offer.basePlanIdAndroid === PRO_BASE_PLAN_ID)
      ?.offerTokenAndroid ?? undefined;
  if (Platform.OS === 'android' && !offerToken) {
    throw new Error('구독 상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }

  await requestPurchase({
    type: 'subs',
    request: {
      google: {
        skus: [PRO_SUBSCRIPTION_SKU],
        subscriptionOffers: offerToken ? [{ sku: PRO_SUBSCRIPTION_SKU, offerToken }] : undefined,
        // 서버가 이 값으로 구매를 사용자에 연결한다 — 없으면 웹훅이 아무도 못 찾는다.
        obfuscatedAccountId: String(userId),
      },
      // 서버가 이 값으로 구매를 사용자에 연결한다 — 구글의 obfuscatedAccountId 와 같은 역할.
      apple: { sku: PRO_SUBSCRIPTION_SKU, appAccountToken: appAccountTokenOf(userId) },
    },
  });
}

/** 서버에 구매를 검증시키고, 반영된 뒤에만 스토어 트랜잭션을 닫는다. */
async function verifyAndFinish(purchase: Purchase): Promise<void> {
  /*
   * 스토어마다 서버에 보내는 것이 다르다.
   *  - 안드로이드: purchaseToken (Play Developer API 의 키)
   *  - iOS: 거래 id (App Store Server API 의 키). purchase.purchaseToken 은 JWS 라
   *    그대로 보내면 서버가 쓰지 않는 값이다.
   * 웹은 애초에 여기까지 오지 않는다(리스너를 안 건다).
   */
  const verify = async (): Promise<void> => {
    if (Platform.OS === 'android') {
      const token = purchase.purchaseToken;
      if (!token) return Promise.reject(new Error('purchaseToken 없음'));
      await planApi.verifyGooglePurchase(token);
      return;
    }
    // StoreKit 의 거래 id. 갱신 거래여도 애플이 같은 구독의 최신 상태를 돌려준다.
    if (!purchase.id) return Promise.reject(new Error('transactionId 없음'));
    await planApi.verifyApplePurchase(purchase.id);
  };

  try {
    await verify();
    await finishTransaction({ purchase, isConsumable: false });
    await usePlanStore.getState().load();
    toast.success('PRO가 시작됐어요!');
  } catch {
    // 검증 실패 — 트랜잭션을 닫지 않는다. 다음 앱 실행/재시도에서 다시 처리된다
    // (안드로이드 3일 자동환불 유예 안에서는 안전하다).
  }
}
