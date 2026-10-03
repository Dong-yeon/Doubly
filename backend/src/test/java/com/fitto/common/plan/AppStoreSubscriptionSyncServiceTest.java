package com.fitto.common.plan;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 애플 쪽 동기화의 저장·경합 처리 — {@link GooglePlaySubscriptionSyncServiceTest} 의 짝.
 *
 * <p>키는 거래 id 가 아니라 {@code originalTransactionId} 다. 같은 구독의 갱신 거래 id 가 앱과 웹훅에서
 * 거의 동시에 들어와도 행은 하나여야 하고, 늦은 쪽이 500 을 내면 안 된다(docs/my-current-state.md §7-2).
 */
@ExtendWith(MockitoExtension.class)
class AppStoreSubscriptionSyncServiceTest {

    private static final String TX = "2000000123456789";
    private static final String ORIGINAL = "2000000000000001";

    @Mock
    AppStoreServerApiClient apiClient;
    @Mock
    SubscriptionRepository subscriptionRepository;
    @Mock
    EventLogService eventLogService;
    @Mock
    PlatformTransactionManager transactionManager;

    AppStoreSubscriptionSyncService service;

    @BeforeEach
    void setUp() {
        service = new AppStoreSubscriptionSyncService(apiClient, subscriptionRepository, eventLogService,
                transactionManager);
    }

    private AppStoreSubscriptionState active(LocalDateTime expiry) {
        return new AppStoreSubscriptionState(SubscriptionStatus.ACTIVE, "pro_monthly", ORIGINAL, expiry, true, 7L);
    }

    @Test
    void 새_구독은_original_거래_id_로_만들고_시작을_한_번_남긴다() {
        when(apiClient.fetch(TX)).thenReturn(active(LocalDateTime.now().plusMonths(1)));
        when(subscriptionRepository.findByPurchaseToken(ORIGINAL)).thenReturn(Optional.empty());

        service.sync(TX);

        verify(subscriptionRepository).saveAndFlush(any());
        verify(eventLogService, times(1)).log(7L, AnalyticsEvent.SUBSCRIPTION_STARTED, Store.APP_STORE.name());
    }

    @Test
    void 동시에_들어와_유니크에_막히면_먼저_생긴_구독에_반영하고_시작_계측은_남기지_않는다() {
        LocalDateTime expiry = LocalDateTime.now().plusMonths(1);
        Subscription winner = Subscription.builder()
                .userId(7L).plan(Plan.PRO).status(SubscriptionStatus.ACTIVE)
                .store(Store.APP_STORE).productId("pro_monthly").purchaseToken(ORIGINAL)
                .build();
        when(apiClient.fetch(TX)).thenReturn(active(expiry));
        when(subscriptionRepository.findByPurchaseToken(ORIGINAL))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(winner));
        when(subscriptionRepository.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("uk_subscriptions_purchase_token"));

        service.sync(TX);

        verify(subscriptionRepository, times(1)).saveAndFlush(any());
        assertThat(winner.getExpiresAt()).isEqualTo(expiry);
        verify(eventLogService, never()).log(any(Long.class), anyString(), anyString());
    }
}
