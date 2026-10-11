package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

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
    private final EventLogService eventLogService;
    private final TransactionTemplate tx;

    public GooglePlaySubscriptionSyncService(GooglePlayDeveloperApiClient apiClient,
                                              SubscriptionRepository subscriptionRepository,
                                              EventLogService eventLogService,
                                              PlatformTransactionManager transactionManager) {
        this.apiClient = apiClient;
        this.subscriptionRepository = subscriptionRepository;
        this.eventLogService = eventLogService;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /**
     * <p><b>트랜잭션을 메서드에 걸지 않는다.</b> 같은 영수증이 동시에 들어오면(검증 연타, 검증 API 와 웹훅이 같은 순간에
     * 도착) 둘 다 "없다"를 보고 INSERT 한다. 예전엔 그 INSERT 가 커밋 때에야 나가서, 늦은 쪽의 유니크 위반이 메서드가
     * 끝난 뒤 터져 500 이 됐고 앱은 "구매를 확인하지 못했어요"를 띄웠다(PRO 는 이미 한 번 들어간 상태인데도 —
     * docs/my-current-state.md §7-2). 이제 저장은 즉시 flush 하는 트랜잭션 안에서 하고, 유니크에 막히면 새 트랜잭션에서
     * 한 번 더 — 이번엔 먼저 들어간 행을 찾아 상태만 맞춘다. 같은 트랜잭션에서 다시 시도하면 이미 롤백 표시가 붙어 있다
     * ({@code JournalService.save} 와 같은 방식). 스토어 API 호출도 트랜잭션 밖이라 DB 커넥션을 붙잡지 않는다.
     */
    public void sync(String purchaseToken) {
        GooglePlaySubscriptionState state = apiClient.fetch(purchaseToken);
        if (state == null) {
            // 서비스 계정 미설정이거나 일시적 API 실패 — 스토어가 RTDN을 재전송하므로
            // 여기서 예외를 던지지 않고 다음 재전송을 기다린다.
            log.warn("Play 구독 상태를 조회하지 못함 — purchaseToken={}", mask(purchaseToken));
            return;
        }

        Long created;
        try {
            created = tx.execute(status -> upsert(purchaseToken, state));
        } catch (DataIntegrityViolationException raced) {
            // 같은 영수증을 다른 요청이 방금 넣었다 — 그 행에 지금 상태를 반영한다(새로 만들지 않는다)
            created = tx.execute(status -> upsert(purchaseToken, state));
        }
        // 결제 퍼널의 끝 — 커밋이 확정된 뒤, 실제로 처음 만든 쪽만 한 번 남긴다(경합에서 진 쪽은 세지 않는다)
        if (created != null) {
            eventLogService.log(created, AnalyticsEvent.SUBSCRIPTION_STARTED, Store.GOOGLE_PLAY.name());
        }
        acknowledgeIfNeeded(purchaseToken, state);
    }

    /**
     * 검증을 통과한 결제를 서버가 승인해 둔다 — 앱이 승인 전에 꺼져도 3일 자동 환불이 나지 않게
     * ({@link GooglePlayDeveloperApiClient#acknowledgeSubscription}). DB 반영이 커밋된 뒤에만 하고,
     * 실패해도 동기화는 성공이다 — 앱의 승인과 다음 알림이 남아 있다.
     */
    private void acknowledgeIfNeeded(String purchaseToken, GooglePlaySubscriptionState state) {
        if (state.acknowledged() || state.status() != SubscriptionStatus.ACTIVE
                || state.userId() == null || !SubscriptionProducts.grantsPro(state.productId())) {
            return;
        }
        apiClient.acknowledgeSubscription(state.productId(), purchaseToken);
    }

    /** 있으면 상태를 맞추고 없으면 만든다. 새로 만들었으면 그 사용자 id, 아니면 null. */
    private Long upsert(String purchaseToken, GooglePlaySubscriptionState state) {
        var existing = subscriptionRepository.findByPurchaseToken(purchaseToken);
        if (existing.isPresent()) {
            apply(existing.get(), state);
            return null;
        }
        return create(purchaseToken, state);
    }

    private void apply(Subscription subscription, GooglePlaySubscriptionState state) {
        switch (state.status()) {
            case ACTIVE -> subscription.renew(state.expiresAt(), state.autoRenew());
            case EXPIRED -> subscription.expire();
            case REFUNDED -> subscription.refund();
        }
    }

    private Long create(String purchaseToken, GooglePlaySubscriptionState state) {
        if (state.userId() == null) {
            // 클라이언트가 구매 시 setObfuscatedAccountId(userId)를 안 실었거나(아직 결제
            // SDK 연동 전), 우리 쪽 사용자에 연결할 방법이 없는 알림 — 새로 만들 수 없으니
            // 건너뛴다. 이후 알림이 다시 오면 그때 연결된 값으로 재시도된다.
            log.warn("Play 구독을 사용자에 연결할 수 없음(계정 식별자 없음) — purchaseToken={}",
                    mask(purchaseToken));
            return null;
        }
        if (!SubscriptionProducts.grantsPro(state.productId())) {
            // PRO 상품이 아니다 — 스토어가 돌려준 상품 id 로 판정한다(앱이 말한 상품을 믿지 않는다)
            log.warn("PRO 상품이 아닌 구독은 만들지 않음 — productId={}", state.productId());
            return null;
        }
        if (state.status() != SubscriptionStatus.ACTIVE) {
            // 활성이 아닌 상태의 "첫" 알림(예: 취소 직후 도착)은 새로 만들 이유가 없다.
            return null;
        }
        subscriptionRepository.saveAndFlush(Subscription.builder()
                .userId(state.userId())
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.GOOGLE_PLAY)
                .productId(state.productId())
                .purchaseToken(purchaseToken)
                .expiresAt(state.expiresAt())
                .autoRenew(state.autoRenew())
                .build());
        return state.userId();
    }

    /** 로그에 거래 토큰 전체를 남기지 않는다 — 앞뒤 일부만 보여 추적은 되게 하되 통째로 남기지 않는다. */
    private String mask(String token) {
        if (token == null || token.length() < 8) {
            return "***";
        }
        return token.substring(0, 4) + "…" + token.substring(token.length() - 4);
    }
}
