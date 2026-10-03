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
    private final EventLogService eventLogService;
    private final TransactionTemplate tx;

    public AppStoreSubscriptionSyncService(AppStoreServerApiClient apiClient,
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

        Long created;
        try {
            created = tx.execute(status -> upsert(state));
        } catch (DataIntegrityViolationException raced) {
            // 같은 영수증을 다른 요청이 방금 넣었다 — 그 행에 지금 상태를 반영한다(새로 만들지 않는다)
            created = tx.execute(status -> upsert(state));
        }
        // 결제 퍼널의 끝 — 커밋이 확정된 뒤, 실제로 처음 만든 쪽만 한 번 남긴다(경합에서 진 쪽은 세지 않는다)
        if (created != null) {
            eventLogService.log(created, AnalyticsEvent.SUBSCRIPTION_STARTED, Store.APP_STORE.name());
        }
    }

    /** 있으면 상태를 맞추고 없으면 만든다. 새로 만들었으면 그 사용자 id, 아니면 null. */
    private Long upsert(AppStoreSubscriptionState state) {
        var existing = subscriptionRepository.findByPurchaseToken(state.originalTransactionId());
        if (existing.isPresent()) {
            apply(existing.get(), state);
            return null;
        }
        return create(state);
    }

    private void apply(Subscription subscription, AppStoreSubscriptionState state) {
        switch (state.status()) {
            case ACTIVE -> subscription.renew(state.expiresAt(), state.autoRenew());
            case EXPIRED -> subscription.expire();
            case REFUNDED -> subscription.refund();
        }
    }

    private Long create(AppStoreSubscriptionState state) {
        if (state.userId() == null) {
            /*
             * 구매 때 appAccountToken 을 안 실었거나 우리 규칙으로 만든 UUID 가 아니다
             * (AppAccountTokens 참고). 어느 사용자 것인지 알 수 없으므로 만들지 않는다 —
             * 엉뚱한 계정에 붙이는 것보다 낫다. 앱이 다시 검증을 요청하면 그때 연결된다.
             */
            log.warn("App Store 구독을 사용자에 연결할 수 없음(appAccountToken 없음) — original={}",
                    mask(state.originalTransactionId()));
            return null;
        }
        if (state.status() != SubscriptionStatus.ACTIVE) {
            // 활성이 아닌 상태의 "첫" 알림(해지 직후 도착 등)은 새로 만들 이유가 없다.
            return null;
        }
        subscriptionRepository.saveAndFlush(Subscription.builder()
                .userId(state.userId())
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.APP_STORE)
                .productId(state.productId())
                .purchaseToken(state.originalTransactionId())
                .expiresAt(state.expiresAt())
                .autoRenew(state.autoRenew())
                .build());
        return state.userId();
    }

    /** 로그에 거래 id 전체를 남기지 않는다 — 앞뒤 일부만 보여 추적은 되게 한다. */
    private String mask(String token) {
        if (token == null || token.length() < 8) {
            return "***";
        }
        return token.substring(0, 4) + "…" + token.substring(token.length() - 4);
    }
}
