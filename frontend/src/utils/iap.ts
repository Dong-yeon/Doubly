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
import type { PlanInfo } from '../types';
import { usePlanStore } from '../store/planStore';
import { toast } from '../store/toastStore';
import { storage } from './storage';
import { PRO_BASE_PLAN_ID, PRO_SUBSCRIPTION_SKU, STORAGE_KEYS } from '../constants/config';

/**
 * 어떤 경로로 이 구매를 처리하게 됐나 — 사용자에게 무엇을 말할지가 여기서 갈린다.
 *  - launch:   앱 시작 시 {@code getAvailablePurchases()} 가 돌려준 것. 사용자는 아무것도 안 눌렀다
 *  - purchase: 방금 결제창에서 성사된 것. 결과를 반드시 말해야 한다
 *  - restore:  플랜 화면의 "구매 복원". 사용자가 결과를 기다리고 있다
 */
type Trigger = 'launch' | 'purchase' | 'restore';

type Outcome = 'reflected' | 'pending' | 'error';

/**
 * 처리한 구매의 기록 — 키는 구매 식별자, 값은 'done'(서버 반영 확인) / 'warned'(미반영 안내함).
 *
 * <p><b>왜 필요한가(2026-09-25)</b>: {@code getAvailablePurchases()} 는 "아직 안 닫은 트랜잭션"이
 * 아니라 <b>살아 있는 구독 전부</b>를 돌려준다(react-native-iap 문서: "non-consumables, active
 * subscriptions, and any pending transactions"). 그래서 구독이 유효한 한 <b>앱을 켤 때마다</b>
 * 같은 구매를 다시 검증하고 다시 닫으려 했고, 이미 닫힌 트랜잭션을 또 닫는 호출이 실패하면
 * 아래 catch 가 매번 "반영이 늦어지고 있어요"를 띄웠다 — PRO 는 멀쩡한데 안내만 거짓말을
 * 했다. 서버가 정말 반영하지 못한 경우에도 같은 문장이 매 실행마다 반복됐다.
 *
 * <p>기록은 최근 20건만 둔다. 갱신 거래는 iOS 에서 id 가 새로 나오므로 한 번 더 검증되고
 * 그 뒤로는 기록에 남는다 — 그게 맞다(갱신도 서버가 한 번은 확인해야 한다).
 */
type Handled = Record<string, 'done' | 'warned'>;
const HANDLED_MAX = 20;

async function readHandled(): Promise<Handled> {
  try {
    const raw = await storage.getItem(STORAGE_KEYS.iapHandled);
    return raw ? (JSON.parse(raw) as Handled) : {};
  } catch {
    return {};
  }
}

async function markHandled(key: string, value: 'done' | 'warned'): Promise<void> {
  try {
    const handled = await readHandled();
    handled[key] = value;
    const keys = Object.keys(handled);
    if (keys.length > HANDLED_MAX) {
      keys.slice(0, keys.length - HANDLED_MAX).forEach((k) => delete handled[k]);
    }
    await storage.setItem(STORAGE_KEYS.iapHandled, JSON.stringify(handled));
  } catch {
    // 기록 실패는 다음 실행에서 한 번 더 검증하는 정도라 무시한다
  }
}

/** 구매 식별자 — 안드로이드는 purchaseToken, iOS 는 거래 id. 검증에 보내는 값과 같다. */
function keyOf(purchase: Purchase): string | null {
  return Platform.OS === 'android' ? (purchase.purchaseToken ?? null) : (purchase.id ?? null);
}

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
      await verifyAndFinish(purchase, 'launch');
    }
  } catch {
    // 스토어 연결 실패 — 구매 버튼을 누를 때 다시 시도된다
  }
}

/**
 * 구매 복원 — 플랜 화면의 "구매 복원". 기기를 바꾸거나 다시 설치한 뒤, 또는 결제는 됐는데
 * PRO 가 안 보일 때 사용자가 직접 누르는 재시도 경로다(애플 심사 3.1.1 이 눈에 보이는 복원
 * 수단을 본다). 앱 시작 경로와 같은 검증을 타되, 결과를 <b>반드시</b> 말한다.
 *
 * @returns 반영된 구매가 하나라도 있으면 'reflected', 구매는 있는데 서버가 아직이면 'pending',
 *          복원할 구매가 없으면 'none', 스토어 연결 자체가 안 되면 'error'
 */
export async function restorePurchases(): Promise<'reflected' | 'pending' | 'none' | 'error'> {
  if (Platform.OS === 'web') return 'none';
  let purchases: Purchase[];
  try {
    await initConnection();
    attachPurchaseListeners();
    purchases = (await getAvailablePurchases()) ?? [];
  } catch {
    return 'error';
  }
  if (purchases.length === 0) return 'none';
  let result: 'reflected' | 'pending' | 'none' | 'error' = 'none';
  for (const purchase of purchases) {
    const outcome = await verifyAndFinish(purchase, 'restore');
    if (outcome === 'reflected') result = 'reflected';
    else if (outcome === 'pending' && result !== 'reflected') result = 'pending';
    else if (outcome === 'error' && result === 'none') result = 'error';
  }
  return result;
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
    void verifyAndFinish(purchase, 'purchase');
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
   * 상품을 못 읽으면 여기서 멈춘다 — 스토어에 상품이 없거나(등록 전) 연결이 안 된 상태다.
   * 그대로 결제창을 열면 스토어가 던지는 영문 오류가 그대로 올라온다.
   */
  if (!product) {
    throw new Error('구독 상품 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }
  /*
   * 기본 요금제를 <b>id 로 골라야 한다</b> — 예전엔 subscriptionOffers[0] 을 그냥 집었는데,
   * 한 상품 아래 기본 요금제가 여럿이면(현재 monthly/base 둘) 청구 주기가 Play 가 주는
   * 순서에 달리게 된다. 월 구독을 누른 사람이 주 단위로 빠져나가는 건 되돌리기 어렵다.
   * 못 찾으면 결제를 시작하지 않는다 — 다른 요금제를 조용히 파느니 실패하는 게 낫다.
   */
  const offerToken =
    product.subscriptionOffers?.find((offer) => offer.basePlanIdAndroid === PRO_BASE_PLAN_ID)
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

/**
 * 서버에 구매를 검증시키고, 반영된 뒤에만 스토어 트랜잭션을 닫는다.
 *
 * <p>실패를 셋으로 나눈다 — 예전엔 catch 하나가 전부 "반영이 늦어지고 있어요"였다.
 *  - 서버 응답이 PRO 가 아님(pending): 결제는 스토어에서 됐는데 우리 쪽이 아직이다.
 *    트랜잭션을 닫지 않아 다음 실행에서 다시 온다. <b>같은 구매는 한 번만</b> 알린다 —
 *    매 실행마다 같은 문장이 뜨면 앱이 고장 난 것으로 읽힌다. 방금 결제한 경우와 "구매 복원"은
 *    사용자가 결과를 기다리므로 항상 말한다
 *  - 검증 요청 실패(error): 네트워크·401(로그아웃 상태)·서버 장애. 앱 시작 경로에서는
 *    조용히 넘기고 다음 실행에 맡긴다
 *  - 반영됨(reflected): 닫는 호출이 실패해도(이미 닫힌 트랜잭션) 반영은 된 것이다 — 기록하고 끝
 */
async function verifyAndFinish(purchase: Purchase, trigger: Trigger): Promise<Outcome> {
  const key = keyOf(purchase);
  const handled = key ? await readHandled() : {};

  if (trigger === 'launch' && key) {
    // 이미 반영을 확인한 구매 — 살아 있는 구독은 매 실행마다 다시 오므로 여기서 걸러야 한다
    if (handled[key] === 'done') return 'reflected';
    // 안드로이드는 스토어가 "닫혔다(acknowledge)"를 알려준다 — 이 수정 전에 닫은 구매도 걸러진다
    if ('isAcknowledgedAndroid' in purchase && purchase.isAcknowledgedAndroid) {
      await markHandled(key, 'done');
      return 'reflected';
    }
  }

  /*
   * 스토어마다 서버에 보내는 것이 다르다.
   *  - 안드로이드: purchaseToken (Play Developer API 의 키)
   *  - iOS: 거래 id (App Store Server API 의 키). purchase.purchaseToken 은 JWS 라
   *    그대로 보내면 서버가 쓰지 않는 값이다.
   * 웹은 애초에 여기까지 오지 않는다(리스너를 안 건다).
   */
  const verify = async (): Promise<PlanInfo> => {
    if (Platform.OS === 'android') {
      const token = purchase.purchaseToken;
      if (!token) throw new Error('purchaseToken 없음');
      return planApi.verifyGooglePurchase(token);
    }
    // StoreKit 의 거래 id. 갱신 거래여도 애플이 같은 구독의 최신 상태를 돌려준다.
    if (!purchase.id) throw new Error('transactionId 없음');
    return planApi.verifyApplePurchase(purchase.id);
  };

  let info: PlanInfo;
  try {
    info = await verify();
  } catch {
    if (trigger !== 'launch') {
      toast.error('구매를 확인하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.');
    }
    return 'error';
  }

  /*
   * <b>200 은 "반영됐다"가 아니다.</b> 서버는 스토어 조회에 실패해도(키 미설정·일시적
   * 장애·귀속 불일치) 예외를 던지지 않고 <b>지금 플랜</b>을 그대로 돌려준다 — 애플·구글이
   * 웹훅을 재전송하므로 서버 입장에서는 그게 맞는 처리다. 대신 여기서 확인하지 않으면
   * 돈만 빠져나간 채 "PRO가 시작됐어요!" 가 뜨고, 트랜잭션까지 닫혀 재시도 경로마저
   * 사라진다. 응답에 담겨 온 플랜으로 실제 반영 여부를 판정한다.
   */
  if (info.plan !== 'PRO') {
    const warnedBefore = key ? handled[key] === 'warned' : false;
    if (trigger !== 'launch' || !warnedBefore) {
      toast.info('결제는 확인했어요. 반영이 조금 늦어지고 있어요 — 앱을 다시 열면 이어집니다.');
      if (key) await markHandled(key, 'warned');
    }
    return 'pending';
  }

  /*
   * 반영됐다. 트랜잭션을 닫는다 — 안드로이드는 3일 안에 닫지 않으면 자동 환불된다.
   * 닫는 호출이 실패하는 건 대개 이미 닫힌 트랜잭션이라 반영과는 무관하다 — 기록은 남긴다.
   */
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch {
    // 이미 닫혔거나 스토어가 잠시 응답하지 않음 — 반영은 서버가 이미 확인했다
  }
  const firstTime = !key || handled[key] !== 'done';
  if (key) await markHandled(key, 'done');
  await usePlanStore.getState().load();
  if (trigger === 'purchase' || (trigger === 'launch' && firstTime)) {
    toast.success('PRO가 시작됐어요!');
  }
  return 'reflected';
}
