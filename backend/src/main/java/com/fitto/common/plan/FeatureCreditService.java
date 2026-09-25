package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 기능 크레딧의 검증·기록·차감 — 스티커 팩의 {@code StickerPurchaseService} 와 같은 원칙.
 *
 * <p><b>앱이 보낸 내용을 믿지 않는다.</b> 상품도 귀속도 스토어에 되물어 정한다. 남의 거래 id 를
 * 보내도 자기 계정에 크레딧이 붙지 않고, 다른 상품의 영수증으로 이 상품을 열 수 없다.
 *
 * <p><b>검증 메서드에 {@code @Transactional} 을 걸지 않는다.</b> 스티커와 같은 이유 둘 —
 * unique 위반을 잡아 멱등으로 처리하려면 저장 한 줄만 자기 트랜잭션이어야 하고, 스토어
 * 왕복(최대 15초)이 DB 커넥션을 물고 있으면 안 된다. 차감·되돌림은 짧으니 트랜잭션을 건다.
 */
@Service
public class FeatureCreditService {

    private static final Logger log = LoggerFactory.getLogger(FeatureCreditService.class);

    private final FeatureCreditRepository repository;
    private final GooglePlayDeveloperApiClient googlePlayClient;
    private final AppStoreServerApiClient appStoreClient;
    private final EventLogService eventLogService;

    public FeatureCreditService(FeatureCreditRepository repository,
                                GooglePlayDeveloperApiClient googlePlayClient,
                                AppStoreServerApiClient appStoreClient,
                                EventLogService eventLogService) {
        this.repository = repository;
        this.googlePlayClient = googlePlayClient;
        this.appStoreClient = appStoreClient;
        this.eventLogService = eventLogService;
    }

    /** 이 기능에 남은 크레딧 — 표시와 판정이 같은 값을 본다. */
    @Transactional(readOnly = true)
    public int remaining(Long userId, Feature feature) {
        return (int) repository.sumRemaining(userId, feature);
    }

    /** 한 회 차감 — 남은 묶음이 없으면 {@code false}. 먼저 산 것부터 쓴다. */
    @Transactional
    public boolean consumeOne(Long userId, Feature feature) {
        for (FeatureCredit credit : repository.findAvailable(userId, feature)) {
            if (credit.consumeOne()) {
                return true;
            }
        }
        return false;
    }

    /** {@link #consumeOne} 을 되돌린다 — 결과를 하나도 주지 못한 실패 뒤에만. */
    @Transactional
    public void refundOne(Long userId, Feature feature) {
        for (FeatureCredit credit : repository.findConsumed(userId, feature)) {
            if (credit.refundOne()) {
                return;
            }
        }
    }

    /** Play 결제 직후 앱이 부른다. 검증을 통과하면 준 크레딧 수를 돌려준다. */
    public int verifyGoogle(Long userId, String productId, String purchaseToken) {
        CreditProduct product = requireProduct(productId);
        StoreProductPurchase purchase = googlePlayClient.fetchProduct(product.productId(), purchaseToken);
        return record(userId, product, Store.GOOGLE_PLAY, purchase, purchaseToken);
    }

    /** App Store 결제 직후 — {@link #verifyGoogle} 의 짝. */
    public int verifyApple(Long userId, String productId, String transactionId) {
        CreditProduct product = requireProduct(productId);
        StoreProductPurchase purchase = appStoreClient.fetchTransaction(transactionId);
        return record(userId, product, Store.APP_STORE, purchase, transactionId);
    }

    private CreditProduct requireProduct(String productId) {
        return CreditProduct.byProductId(productId == null ? "" : productId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "없는 상품이에요."));
    }

    /**
     * 스토어 응답을 대조하고 크레딧 행을 남긴다 — 조회가 됐는가 · 유효한 결제인가 · 상품이 맞는가 ·
     * <b>우리가 아는 사람의 것인가</b>. 같은 거래가 다시 오면(재설치·연타) 이미 준 크레딧을 돌려준다.
     */
    private int record(Long userId, CreditProduct product, Store store,
                       StoreProductPurchase purchase, String transactionId) {
        if (purchase == null) {
            log.warn("크레딧 결제 검증 실패 — 스토어 조회 불가 (product={}, userId={})", product.productId(), userId);
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        if (!purchase.valid()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 완료되지 않았거나 취소된 결제예요.");
        }
        if (!product.productId().equals(purchase.productId())) {
            log.warn("크레딧 결제 상품 불일치 — 요청={} 스토어={}", product.productId(), purchase.productId());
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제 내역과 상품이 맞지 않아요.");
        }
        if (purchase.userId() == null || !purchase.userId().equals(userId)) {
            log.warn("크레딧 결제 귀속 불일치 — 로그인={} 스토어={}", userId, purchase.userId());
            throw new BusinessException(ErrorCode.FORBIDDEN, "다른 계정에서 결제된 내역이에요.");
        }

        if (repository.findByTransactionId(transactionId).isPresent()) {
            return product.credits();
        }
        try {
            repository.save(FeatureCredit.builder()
                    .userId(userId)
                    .feature(product.feature())
                    .store(store)
                    .productId(product.productId())
                    .transactionId(transactionId)
                    .credits(product.credits())
                    .build());
            eventLogService.log(userId, AnalyticsEvent.CREDIT_PURCHASED, product.productId());
        } catch (DataIntegrityViolationException e) {
            // 동시에 두 번 눌린 경우 — unique 인덱스가 막는다. 이미 줬으므로 성공으로 본다.
            log.debug("크레딧 행 중복 — 이미 지급 (product={}, userId={})", product.productId(), userId);
        }
        return product.credits();
    }
}
