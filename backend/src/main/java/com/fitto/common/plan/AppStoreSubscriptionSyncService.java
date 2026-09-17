package com.fitto.common.plan;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 거래 id 하나를 받아 {@code subscriptions} 테이블을 실제 상태와 맞춘다.
 *
 * <p>{@link GooglePlaySubscriptionSyncService} 의 애플 판이다 — 알림은 "뭔가 바뀌었다"만
 * 알려주므로, 여기서 Server API 를 다시 불러 진짜 상태를 확정한 뒤에만 DB 를 바꾼다.
 *
 * <p><b>키는 {@code originalTransactionId} 다.</b> 갱신될 때마다 거래 id 는 새로 발급되지만
 * 이 값은 구독 하나에 고정이라, 매달 행이 하나씩 늘어나는 것을 막는다
 * (구글 쪽 {@code purchaseToken} 과 같은 역할).
 */
@Service
public class AppStoreSubscriptionSyncService {

    private static final Logger log = LoggerFactory.getLogger(AppStoreSubscriptionSyncService.class);

    private final AppStoreServerApiClient apiClient;
    private final SubscriptionRepository subscriptionRepository;

    public AppStoreSubscriptionSyncService(AppStoreServerApiClient apiClient,
                                            SubscriptionRepository subscriptionRepository) {
        this.apiClient = apiClient;
        this.subscriptionRepository = subscriptionRepository;
    }

    @Transactional
    public void sync(String transactionId) {
        AppStoreSubscriptionState state = apiClient.fetch(transactionId);
        if (state == null) {
            // 키 미설정이거나 일시적 API 실패 — 애플이 알림을 재전송하므로 예외를 던지지 않는다.
            log.warn("App Store 구독 상태를 조회하지 못함 — transactionId={}", mask(transactionId));
            return;
        }
        if (state.originalTransactionId() == null) {
            log.warn("App Store 응답에 originalTransactionId 가 없음 — transactionId={}", mask(transactionId));
            return;
        }

        subscriptionRepository.findByPurchaseToken(state.originalTransactionId())
                .ifPresentOrElse(
                        existing -> apply(existing, state),
                        () -> create(state));
    }

    private void apply(Subscription subscription, AppStoreSubscriptionState state) {
        switch (state.status()) {
            case ACTIVE -> subscription.renew(state.expiresAt(), state.autoRenew());
            case EXPIRED -> subscription.expire();
            case REFUNDED -> subscription.refund();
        }
    }

    private void create(AppStoreSubscriptionState state) {
        if (state.userId() == null) {
            /*
             * 구매 때 appAccountToken 을 안 실었거나 우리 규칙으로 만든 UUID 가 아니다
             * (AppAccountTokens 참고). 어느 사용자 것인지 알 수 없으므로 만들지 않는다 —
             * 엉뚱한 계정에 붙이는 것보다 낫다. 앱이 다시 검증을 요청하면 그때 연결된다.
             */
            log.warn("App Store 구독을 사용자에 연결할 수 없음(appAccountToken 없음) — original={}",
                    mask(state.originalTransactionId()));
            return;
        }
        if (state.status() != SubscriptionStatus.ACTIVE) {
            // 활성이 아닌 상태의 "첫" 알림(해지 직후 도착 등)은 새로 만들 이유가 없다.
            return;
        }
        subscriptionRepository.save(Subscription.builder()
                .userId(state.userId())
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.APP_STORE)
                .productId(state.productId())
                .purchaseToken(state.originalTransactionId())
                .expiresAt(state.expiresAt())
                .autoRenew(state.autoRenew())
                .build());
    }

    /** 로그에 거래 id 전체를 남기지 않는다 — 앞뒤 일부만 보여 추적은 되게 한다. */
    private String mask(String token) {
        if (token == null || token.length() < 8) {
            return "***";
        }
        return token.substring(0, 4) + "…" + token.substring(token.length() - 4);
    }
}
