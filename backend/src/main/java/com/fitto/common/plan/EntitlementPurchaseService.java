package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

/**
 * 영구 상품(Dubly Plus 영구) 결제 검증·복원·환불 — 크라운({@code CurrencyPurchaseService})과 같은 원칙.
 *
 * <p><b>앱이 보낸 내용을 믿지 않는다.</b> 상품도 귀속도 스토어에 되물어 정한다. 다른 점은 둘이다:
 * <ul>
 *   <li><b>consume 하지 않는다</b> — Play 는 승인(acknowledge)만 한다. 소모하면 다시 살 수 있게 되고 복원 목록에서 빠진다.</li>
 *   <li><b>복원이 같은 API 를 다시 부른다</b> — 같은 거래면 이미 있는 행을 그대로 두고 성공으로 끝난다(멱등).
 *       다른 계정 것이면 403. 탈퇴 후 재가입한 계정은 스토어 귀속 id 가 달라 복원되지 않는다(계획 D9 — 탈퇴 확인문에 고지).</li>
 * </ul>
 * 스토어 왕복이 DB 커넥션을 물지 않게 트랜잭션을 걸지 않는다 — 저장 한 번만 자기 트랜잭션이다.
 */
@Service
public class EntitlementPurchaseService {

    private static final Logger log = LoggerFactory.getLogger(EntitlementPurchaseService.class);

    private final UserEntitlementRepository repository;
    private final GooglePlayDeveloperApiClient googlePlayClient;
    private final AppStoreServerApiClient appStoreClient;
    private final EventLogService eventLogService;
    private final PlanChangeNotifier planChangeNotifier;

    public EntitlementPurchaseService(UserEntitlementRepository repository, GooglePlayDeveloperApiClient googlePlayClient,
                                      AppStoreServerApiClient appStoreClient, EventLogService eventLogService,
                                      PlanChangeNotifier planChangeNotifier) {
        this.repository = repository;
        this.googlePlayClient = googlePlayClient;
        this.appStoreClient = appStoreClient;
        this.eventLogService = eventLogService;
        this.planChangeNotifier = planChangeNotifier;
    }

    /** Play 결제 직후·복원 시 앱이 부른다. */
    public void verifyGoogle(Long userId, String productId, String purchaseToken) {
        LifetimeProduct product = requireProduct(productId);
        StoreProductPurchase purchase = googlePlayClient.fetchProduct(product.productId(), purchaseToken);
        record(userId, product, Store.GOOGLE_PLAY, purchase, purchaseToken);
        if (!purchase.acknowledged()) {
            // 승인하지 않으면 3일 뒤 Play 가 자동 환불한다 — 소모(consume)는 하지 않는다(비소모성)
            googlePlayClient.acknowledgeProduct(product.productId(), purchaseToken);
        }
    }

    /** App Store 결제 직후·복원 시 — {@link #verifyGoogle} 의 짝. */
    public void verifyApple(Long userId, String productId, String transactionId) {
        LifetimeProduct product = requireProduct(productId);
        record(userId, product, Store.APP_STORE, appStoreClient.fetchTransaction(transactionId), transactionId);
    }

    private LifetimeProduct requireProduct(String productId) {
        return LifetimeProduct.byProductId(productId == null ? "" : productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "없는 상품이에요."));
    }

    /** 조회가 됐는가 · 유효한가 · 상품이 맞는가 · <b>우리가 아는 사람의 것인가</b>. */
    private void record(Long userId, LifetimeProduct product, Store store, StoreProductPurchase purchase,
                        String transactionId) {
        if (purchase == null) {
            log.warn("영구 상품 결제 검증 실패 — 스토어 조회 불가 (product={}, userId={})", product.productId(), userId);
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        if (!purchase.valid()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 완료되지 않았거나 취소된 결제예요.");
        }
        if (!product.productId().equals(purchase.productId())) {
            log.warn("영구 상품 결제 상품 불일치 — 요청={} 스토어={}", product.productId(), purchase.productId());
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제 내역과 상품이 맞지 않아요.");
        }
        if (purchase.userId() == null || !purchase.userId().equals(userId)) {
            log.warn("영구 상품 결제 귀속 불일치 — 로그인={} 스토어={}", userId, purchase.userId());
            throw new BusinessException(ErrorCode.FORBIDDEN, "다른 계정에서 결제된 내역이에요.");
        }
        if (grant(userId, product, store, transactionId)) {
            eventLogService.log(userId, AnalyticsEvent.CREDIT_PURCHASED, product.productId());
            planChangeNotifier.notifyCouple(userId);
        }
    }

    /** 처음 반영했으면 {@code true}. 이미 있는 거래(복원·재호출·동시 호출)면 {@code false} — 오류가 아니다. */
    private boolean grant(Long userId, LifetimeProduct product, Store store, String transactionId) {
        if (repository.existsByTransactionId(transactionId)) {
            return false;
        }
        try {
            repository.saveAndFlush(UserEntitlement.builder()
                    .userId(userId)
                    .entitlement(product.entitlement())
                    .store(store)
                    .productId(product.productId())
                    .transactionId(transactionId)
                    .build());
            return true;
        } catch (DataIntegrityViolationException raced) {
            // 같은 거래를 동시에 검증했다 — 먼저 들어간 쪽이 반영했다
            return false;
        }
    }

    /** 우리가 영구 상품으로 기록한 거래인가 — 웹훅이 갈래를 정할 때. */
    public boolean isEntitlementPurchase(String transactionId) {
        return transactionId != null && repository.existsByTransactionId(transactionId);
    }

    /** Google 무효 결제 알림 — 우리 거래일 때만, Voided Purchases API 로 다시 확인한 뒤 거둔다. */
    public void revokeIfVoidedOnGooglePlay(String purchaseToken) {
        if (!isEntitlementPurchase(purchaseToken)) {
            return;
        }
        if (Boolean.TRUE.equals(googlePlayClient.isVoided(purchaseToken))) {
            revoke(purchaseToken);
        }
    }

    /** 애플 환불 알림 — 스토어에 다시 물어 정말 환불(revocationDate)됐을 때만 거둔다. 알림 본문을 믿지 않는다. */
    public void revokeIfRefundedOnAppStore(String transactionId) {
        if (!isEntitlementPurchase(transactionId)) {
            return;
        }
        StoreProductPurchase purchase = appStoreClient.fetchTransaction(transactionId);
        if (purchase != null && !purchase.valid()) {
            revoke(transactionId);
        }
    }

    private void revoke(String transactionId) {
        if (repository.revoke(transactionId) > 0) {
            log.info("환불된 영구 상품 회수 — tx={}", transactionId);
            repository.findByTransactionId(transactionId)
                    .ifPresent(e -> planChangeNotifier.notifyCouple(e.getUserId()));
        }
    }
}
