package com.fitto.common.plan;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * purchaseToken 하나를 받아 {@code subscriptions} 테이블을 실제 상태와 맞춘다.
 *
 * <p>RTDN 웹훅({@link GooglePlayWebhookController})과 Play Developer API
 * ({@link GooglePlayDeveloperApiClient}) 사이의 접합부 — 웹훅은 "뭔가 바뀌었다"만 알려주므로,
 * 여기서 API를 다시 불러 진짜 상태를 확정한 뒤에만 DB를 바꾼다.
 */
@Service
public class GooglePlaySubscriptionSyncService {

    private static final Logger log = LoggerFactory.getLogger(GooglePlaySubscriptionSyncService.class);

    private final GooglePlayDeveloperApiClient apiClient;
    private final SubscriptionRepository subscriptionRepository;

    public GooglePlaySubscriptionSyncService(GooglePlayDeveloperApiClient apiClient,
                                              SubscriptionRepository subscriptionRepository) {
        this.apiClient = apiClient;
        this.subscriptionRepository = subscriptionRepository;
    }

    @Transactional
    public void sync(String purchaseToken) {
        GooglePlaySubscriptionState state = apiClient.fetch(purchaseToken);
        if (state == null) {
            // 서비스 계정 미설정이거나 일시적 API 실패 — 스토어가 RTDN을 재전송하므로
            // 여기서 예외를 던지지 않고 다음 재전송을 기다린다.
            log.warn("Play 구독 상태를 조회하지 못함 — purchaseToken={}", mask(purchaseToken));
            return;
        }

        subscriptionRepository.findByPurchaseToken(purchaseToken)
                .ifPresentOrElse(
                        existing -> apply(existing, state),
                        () -> create(purchaseToken, state));
    }

    private void apply(Subscription subscription, GooglePlaySubscriptionState state) {
        switch (state.status()) {
            case ACTIVE -> subscription.renew(state.expiresAt(), state.autoRenew());
            case EXPIRED -> subscription.expire();
            case REFUNDED -> subscription.refund();
        }
    }

    private void create(String purchaseToken, GooglePlaySubscriptionState state) {
        if (state.userId() == null) {
            // 클라이언트가 구매 시 setObfuscatedAccountId(userId)를 안 실었거나(아직 결제
            // SDK 연동 전), 우리 쪽 사용자에 연결할 방법이 없는 알림 — 새로 만들 수 없으니
            // 건너뛴다. 이후 알림이 다시 오면 그때 연결된 값으로 재시도된다.
            log.warn("Play 구독을 사용자에 연결할 수 없음(계정 식별자 없음) — purchaseToken={}",
                    mask(purchaseToken));
            return;
        }
        if (state.status() != SubscriptionStatus.ACTIVE) {
            // 활성이 아닌 상태의 "첫" 알림(예: 취소 직후 도착)은 새로 만들 이유가 없다.
            return;
        }
        subscriptionRepository.save(Subscription.builder()
                .userId(state.userId())
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.GOOGLE_PLAY)
                .productId(state.productId())
                .purchaseToken(purchaseToken)
                .expiresAt(state.expiresAt())
                .autoRenew(state.autoRenew())
                .build());
    }

    /** 로그에 거래 토큰 전체를 남기지 않는다 — 앞뒤 일부만 보여 추적은 되게 하되 통째로 남기지 않는다. */
    private String mask(String token) {
        if (token == null || token.length() < 8) {
            return "***";
        }
        return token.substring(0, 4) + "…" + token.substring(token.length() - 4);
    }
}
