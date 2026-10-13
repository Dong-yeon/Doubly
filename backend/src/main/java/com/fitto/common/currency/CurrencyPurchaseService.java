package com.fitto.common.currency;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.AppStoreServerApiClient;
import com.fitto.common.plan.GooglePlayDeveloperApiClient;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.StoreProductPurchase;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * 재화 묶음 결제 검증 — 크레딧({@code FeatureCreditService})과 같은 원칙.
 *
 * <p><b>앱이 보낸 내용을 믿지 않는다.</b> 상품도 귀속도 스토어에 되물어 정한다. 남의 거래 id 를 보내도 자기 지갑에 들어오지
 * 않고, 다른 상품의 영수증으로 이 묶음을 열 수 없다. 스토어 왕복(최대 15초)이 DB 커넥션을 물지 않게 트랜잭션을 걸지 않는다 —
 * 지급 한 번만 자기 트랜잭션이다({@link CurrencyService#grantPurchase}).
 */
@Service
public class CurrencyPurchaseService {

    private static final Logger log = LoggerFactory.getLogger(CurrencyPurchaseService.class);

    private final CurrencyService currency;
    private final GooglePlayDeveloperApiClient googlePlayClient;
    private final AppStoreServerApiClient appStoreClient;
    private final EventLogService eventLogService;

    public CurrencyPurchaseService(CurrencyService currency, GooglePlayDeveloperApiClient googlePlayClient,
                                   AppStoreServerApiClient appStoreClient, EventLogService eventLogService) {
        this.currency = currency;
        this.googlePlayClient = googlePlayClient;
        this.appStoreClient = appStoreClient;
        this.eventLogService = eventLogService;
    }

    /** Play 결제 직후 앱이 부른다. 검증을 통과하면 지갑에 넣는다(같은 거래는 한 번). */
    public void verifyGoogle(Long userId, String productId, String purchaseToken) {
        CurrencyPack pack = requirePack(productId);
        StoreProductPurchase purchase = googlePlayClient.fetchProduct(pack.productId(), purchaseToken);
        record(userId, pack, Store.GOOGLE_PLAY, purchase, purchaseToken);
        if (!purchase.acknowledged()) {
            // 앱이 소모 전에 꺼지면 3일 뒤 자동 환불 — "재화는 받고 돈은 돌려받는" 상태를 막는다(크레딧과 같은 이유)
            googlePlayClient.acknowledgeProduct(pack.productId(), purchaseToken);
        }
    }

    /** App Store 결제 직후 — {@link #verifyGoogle} 의 짝. */
    public void verifyApple(Long userId, String productId, String transactionId) {
        CurrencyPack pack = requirePack(productId);
        record(userId, pack, Store.APP_STORE, appStoreClient.fetchTransaction(transactionId), transactionId);
    }

    private CurrencyPack requirePack(String productId) {
        return CurrencyPack.byProductId(productId == null ? "" : productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "없는 상품이에요."));
    }

    /** 조회가 됐는가 · 유효한가 · 상품이 맞는가 · <b>우리가 아는 사람의 것인가</b>. */
    private void record(Long userId, CurrencyPack pack, Store store, StoreProductPurchase purchase, String transactionId) {
        if (purchase == null) {
            log.warn("재화 결제 검증 실패 — 스토어 조회 불가 (product={}, userId={})", pack.productId(), userId);
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        if (!purchase.valid()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 완료되지 않았거나 취소된 결제예요.");
        }
        if (!pack.productId().equals(purchase.productId())) {
            log.warn("재화 결제 상품 불일치 — 요청={} 스토어={}", pack.productId(), purchase.productId());
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제 내역과 상품이 맞지 않아요.");
        }
        if (purchase.userId() == null || !purchase.userId().equals(userId)) {
            log.warn("재화 결제 귀속 불일치 — 로그인={} 스토어={}", userId, purchase.userId());
            throw new BusinessException(ErrorCode.FORBIDDEN, "다른 계정에서 결제된 내역이에요.");
        }
        if (currency.grantPurchase(userId, store, pack.productId(), transactionId, pack.amount())) {
            eventLogService.log(userId, AnalyticsEvent.CREDIT_PURCHASED, pack.productId());
        }
    }

    /** Google 무효 결제 알림 — 우리가 재화로 준 거래일 때만, Voided Purchases API 로 다시 확인한 뒤 거둔다. */
    public void revokeIfVoidedOnGooglePlay(String purchaseToken) {
        if (!currency.isCurrencyPurchase(purchaseToken)) {
            return;
        }
        if (Boolean.TRUE.equals(googlePlayClient.isVoided(purchaseToken)) && currency.revokePurchase(purchaseToken)) {
            log.info("환불된 재화 회수 — tx={}", purchaseToken);
        }
    }

    /** 애플 환불 알림 — 스토어에 다시 물어 정말 환불(revocationDate)됐을 때만 거둔다. 알림 본문을 믿지 않는다. */
    public void revokeIfRefundedOnAppStore(String transactionId) {
        if (!currency.isCurrencyPurchase(transactionId)) {
            return;
        }
        StoreProductPurchase purchase = appStoreClient.fetchTransaction(transactionId);
        if (purchase != null && !purchase.valid() && currency.revokePurchase(transactionId)) {
            log.info("환불된 재화 회수 — tx={}", transactionId);
        }
    }
}
