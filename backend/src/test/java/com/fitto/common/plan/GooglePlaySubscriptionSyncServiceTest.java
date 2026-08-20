package com.fitto.common.plan;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * purchaseToken 하나를 받아 subscriptions 테이블을 맞추는 로직 — HTTP/DB 없는 순수 단위 테스트.
 * Play Developer API 호출은 {@link GooglePlayDeveloperApiClient}를 모킹해 대체한다.
 */
@ExtendWith(MockitoExtension.class)
class GooglePlaySubscriptionSyncServiceTest {

    private static final String TOKEN = "test-purchase-token";

    @Mock
    GooglePlayDeveloperApiClient apiClient;
    @Mock
    SubscriptionRepository subscriptionRepository;

    GooglePlaySubscriptionSyncService service;

    @BeforeEach
    void setUp() {
        service = new GooglePlaySubscriptionSyncService(apiClient, subscriptionRepository);
    }

    @Test
    void API_조회에_실패하면_아무것도_바꾸지_않는다() {
        when(apiClient.fetch(TOKEN)).thenReturn(null);

        service.sync(TOKEN);

        verify(subscriptionRepository, never()).findByPurchaseToken(any());
        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    void 이미_있는_구독은_최신_상태로_갱신한다() {
        Subscription existing = Subscription.builder()
                .userId(1L).plan(Plan.PRO).status(SubscriptionStatus.ACTIVE)
                .store(Store.GOOGLE_PLAY).productId("pro.monthly").purchaseToken(TOKEN)
                .build();
        LocalDateTime newExpiry = LocalDateTime.now().plusMonths(1);
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.of(existing));
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.ACTIVE, "pro.monthly",
                        newExpiry, true, null));

        service.sync(TOKEN);

        assertThat(existing.getExpiresAt()).isEqualTo(newExpiry);
        assertThat(existing.isAutoRenew()).isTrue();
        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    void 만료로_판정되면_기존_구독을_만료시킨다() {
        Subscription existing = Subscription.builder()
                .userId(1L).plan(Plan.PRO).status(SubscriptionStatus.ACTIVE)
                .store(Store.GOOGLE_PLAY).productId("pro.monthly").purchaseToken(TOKEN)
                .build();
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.of(existing));
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.EXPIRED, "pro.monthly",
                        null, false, null));

        service.sync(TOKEN);

        assertThat(existing.getStatus()).isEqualTo(SubscriptionStatus.EXPIRED);
    }

    @Test
    void 사용자_식별자가_있는_새_구독은_생성한다() {
        LocalDateTime expiry = LocalDateTime.now().plusMonths(1);
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.empty());
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.ACTIVE, "pro.monthly",
                        expiry, true, 42L));

        service.sync(TOKEN);

        ArgumentCaptor<Subscription> captor = ArgumentCaptor.forClass(Subscription.class);
        verify(subscriptionRepository).save(captor.capture());
        Subscription saved = captor.getValue();
        assertThat(saved.getUserId()).isEqualTo(42L);
        assertThat(saved.getPlan()).isEqualTo(Plan.PRO);
        assertThat(saved.getStore()).isEqualTo(Store.GOOGLE_PLAY);
        assertThat(saved.getPurchaseToken()).isEqualTo(TOKEN);
        assertThat(saved.getExpiresAt()).isEqualTo(expiry);
    }

    @Test
    void 사용자_식별자가_없으면_새로_만들지_않는다() {
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.empty());
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.ACTIVE, "pro.monthly",
                        LocalDateTime.now().plusMonths(1), true, null));

        service.sync(TOKEN);

        verify(subscriptionRepository, never()).save(any());
    }

    @Test
    void 활성이_아닌_첫_알림은_새로_만들지_않는다() {
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.empty());
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.EXPIRED, "pro.monthly",
                        null, false, 42L));

        service.sync(TOKEN);

        verify(subscriptionRepository, never()).save(any());
    }
}
