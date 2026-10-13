package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
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

    /**
     * 한 회 차감 — 남은 묶음이 없으면 {@code false}. 먼저 산 것부터 쓴다.
     *
     * <p><b>자기 트랜잭션에서 돈다(REQUIRES_NEW).</b> 부르는 쪽이 읽기 전용 트랜잭션이면(우리 이모지 서비스가 클래스
     * 기본값으로 그렇다) 합류한 순간 Hibernate 가 flush 하지 않아 {@code true} 를 돌려주고도 {@code used} 가 그대로였다
     * — 산 세트가 한 번도 차감되지 않았다. PostgreSQL 에서는 행 잠금(FOR UPDATE)이 읽기 전용 트랜잭션에서 거절된다
     * (docs/EMOJI_12_REGEN_2026-10-13.md, FeatureCreditReadOnlyTest).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public boolean consumeOne(Long userId, Feature feature) {
        for (FeatureCredit credit : repository.findAvailable(userId, feature)) {
            if (credit.consumeOne()) {
                return true;
            }
        }
        return false;
    }

    /** {@link #consumeOne} 을 되돌린다 — 결과를 하나도 주지 못한 실패 뒤에만. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void refundOne(Long userId, Feature feature) {
        for (FeatureCredit credit : repository.findConsumed(userId, feature)) {
            if (credit.refundOne()) {
                return;
            }
        }
    }

    // ---- 커플당 첫 1회 무료 ----

    /** 쓴 사람 행의 상품 id — 크레딧 판매 상품과 겹치지 않는다(CreditProduct 에 없으므로 검증 경로로는 못 만든다). */
    static final String WELCOME_PRODUCT = "welcome";

    /**
     * 첫 1회 무료를 받을 수 있나 — <b>두 사람 모두</b> 받은 적이 없을 때만.
     *
     * <p>관계가 아니라 사람으로 센다: 재연결은 새 {@code relations} 행을 만들어서, 관계로 세면 헤어졌다 다시 연결할
     * 때마다 무료가 생긴다(docs/MONETIZATION_LIFETIME_2026-10-13.md §4-e). 쓸 때 두 사람 몫을 함께 남긴다.
     */
    @Transactional(readOnly = true)
    public boolean welcomeAvailable(Long userId, Long partnerId, Feature feature) {
        if (partnerId == null) {
            return false;   // 커플 기능의 "커플당" 무료 — 혼자일 때는 없다
        }
        return !repository.existsByTransactionIdIn(java.util.List.of(
                welcomeTransactionId(userId, feature), welcomeTransactionId(partnerId, feature)));
    }

    /**
     * 첫 1회 무료를 쓴다 — 받았으면 {@code true}. 상대 몫 표지를 <b>먼저</b> 남겨, 둘이 동시에 눌러도
     * {@code transaction_id} UNIQUE 가 한쪽만 통과시킨다(먼저 쓴 사람이 상대 id 로 표지를 넣었으므로).
     *
     * <p>두 행 모두 {@code used == credits} 라 잔량({@link #remaining})에는 잡히지 않는다 — 산 크레딧과 섞이지 않는다.
     */
    public boolean claimWelcome(Long userId, Long partnerId, Feature feature) {
        if (!welcomeAvailable(userId, partnerId, feature)) {
            return false;
        }
        try {
            repository.saveAndFlush(FeatureCredit.builder()
                    .userId(partnerId).feature(feature).store(Store.MANUAL)
                    .productId(welcomeMarkerProduct(userId))
                    .transactionId(welcomeTransactionId(partnerId, feature))
                    .credits(0).build());
        } catch (DataIntegrityViolationException e) {
            return false;   // 상대가 방금 받았다
        }
        try {
            FeatureCredit mine = FeatureCredit.builder()
                    .userId(userId).feature(feature).store(Store.MANUAL)
                    .productId(WELCOME_PRODUCT)
                    .transactionId(welcomeTransactionId(userId, feature))
                    .credits(1).build();
            mine.consumeOne();
            repository.saveAndFlush(mine);
        } catch (DataIntegrityViolationException e) {
            // 내 몫이 이미 있었다(거의 동시에 상대가 나를 표지로 남김) — 방금 넣은 상대 표지만 거두고 거절
            repository.deleteWelcome("-", welcomeMarkerProduct(userId));
            return false;
        }
        return true;
    }

    /** 첫 1회 무료로 연 작업이 한 장도 못 남겼다 — 두 사람 다 다시 받을 수 있게 되돌린다. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void releaseWelcome(Long userId, Feature feature) {
        repository.deleteWelcome(welcomeTransactionId(userId, feature), welcomeMarkerProduct(userId));
    }

    private static String welcomeTransactionId(Long userId, Feature feature) {
        return "welcome:" + feature.name() + ":" + userId;
    }

    /** 상대 몫 표지의 상품 id — 누가 써서 생긴 표지인지 남겨 되돌릴 때 같이 거둔다. */
    private static String welcomeMarkerProduct(Long usedBy) {
        return "welcome_by:" + usedBy;
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
            acknowledgeIfNeeded(store, product, purchase, transactionId);
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
        acknowledgeIfNeeded(store, product, purchase, transactionId);
        return product.credits();
    }

    /**
     * 크레딧을 준 결제를 서버가 승인해 둔다(Google 만) — 앱이 소모(consume) 전에 꺼지면 3일 뒤 자동 환불되어
     * <b>크레딧은 받고 돈은 돌려받는</b> 상태가 됐다(docs/my-current-state.md §7-2). 소모는 여전히 앱이 한다.
     */
    private void acknowledgeIfNeeded(Store store, CreditProduct product, StoreProductPurchase purchase,
                                     String purchaseToken) {
        if (store == Store.GOOGLE_PLAY && !purchase.acknowledged()) {
            googlePlayClient.acknowledgeProduct(product.productId(), purchaseToken);
        }
    }

    /**
     * 애플 환불 알림 — 스토어에 다시 물어 정말 환불(revocationDate)됐을 때만 안 쓴 크레딧을 거둔다.
     *
     * <p>알림 본문을 믿지 않는 이유는 구독 쪽과 같다({@code AppStoreNotificationController} 주석) — 웹훅 인증이
     * 공유 토큰뿐이라, 본문만 보고 거두면 토큰이 새는 순간 남의 크레딧을 지울 수 있다.
     */
    public void revokeIfRefundedOnAppStore(String transactionId) {
        if (repository.findByTransactionId(transactionId).isEmpty()) {
            return;   // 우리가 준 적 없는 거래(다른 상품·다른 앱)
        }
        StoreProductPurchase purchase = appStoreClient.fetchTransaction(transactionId);
        if (purchase == null || purchase.valid()) {
            return;   // 조회 실패면 다음 알림을 기다린다. 유효하면 거둘 게 없다
        }
        revoke(transactionId);
    }

    /** Google 무효 결제 알림 — Voided Purchases API 로 다시 확인한 뒤에만 거둔다({@link #revokeIfRefundedOnAppStore} 와 같은 이유). */
    public void revokeIfVoidedOnGooglePlay(String purchaseToken) {
        if (repository.findByTransactionId(purchaseToken).isEmpty()) {
            return;
        }
        if (!Boolean.TRUE.equals(googlePlayClient.isVoided(purchaseToken))) {
            return;
        }
        revoke(purchaseToken);
    }

    /**
     * 같은 클래스 안에서 부르므로 {@code @Transactional} 프록시를 타지 않는다 — 그래서 고친 행을 직접 {@code save} 한다
     * (리포지토리의 save 가 자기 트랜잭션을 연다). 거둔 뒤 그 회차의 실패 되돌림({@link #refundOne})이 오면 한 회가
     * 다시 살아날 수 있지만, 환불과 그 회차 실패가 겹치는 드문 경우라 받아들인다.
     */
    private void revoke(String transactionId) {
        repository.findByTransactionId(transactionId).ifPresent(credit -> {
            int taken = credit.revokeUnused();
            repository.save(credit);
            log.info("환불된 크레딧 회수 — product={} userId={} taken={}", credit.getProductId(), credit.getUserId(), taken);
            eventLogService.log(credit.getUserId(), AnalyticsEvent.CREDIT_REVOKED, credit.getProductId() + ":" + taken);
        });
    }
}
