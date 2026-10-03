package com.fitto.common.plan;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
    @Mock
    com.fitto.common.analytics.EventLogService eventLogService;
    /** 트랜잭션 경계는 여기서 보지 않는다 — 모킹으로 통과시키고 저장·경합 처리만 본다 */
    @Mock
    PlatformTransactionManager transactionManager;

    GooglePlaySubscriptionSyncService service;

    @BeforeEach
    void setUp() {
        service = new GooglePlaySubscriptionSyncService(apiClient, subscriptionRepository, eventLogService,
                transactionManager);
    }

    @Test
    void API_조회에_실패하면_아무것도_바꾸지_않는다() {
        when(apiClient.fetch(TOKEN)).thenReturn(null);

        service.sync(TOKEN);

        verify(subscriptionRepository, never()).findByPurchaseToken(any());
        verify(subscriptionRepository, never()).saveAndFlush(any());
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
        verify(subscriptionRepository, never()).saveAndFlush(any());
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
        verify(subscriptionRepository).saveAndFlush(captor.capture());
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

        verify(subscriptionRepository, never()).saveAndFlush(any());
    }

    @Test
    void 활성이_아닌_첫_알림은_새로_만들지_않는다() {
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.empty());
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.EXPIRED, "pro.monthly",
                        null, false, 42L));

        service.sync(TOKEN);

        verify(subscriptionRepository, never()).saveAndFlush(any());
    }

    /**
     * 같은 영수증이 동시에 들어온 경우 — 검증 연타, 또는 검증 API 와 웹훅이 같은 순간에 도착.
     * 늦은 쪽이 유니크에 막혀도 500 이 아니라, 먼저 들어간 행에 상태를 반영하고 끝나야 한다.
     */
    @Test
    void 동시에_들어와_유니크에_막히면_먼저_생긴_구독에_반영하고_시작_계측은_남기지_않는다() {
        LocalDateTime expiry = LocalDateTime.now().plusMonths(1);
        Subscription winner = Subscription.builder()
                .userId(42L).plan(Plan.PRO).status(SubscriptionStatus.ACTIVE)
                .store(Store.GOOGLE_PLAY).productId("pro.monthly").purchaseToken(TOKEN)
                .build();
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.ACTIVE, "pro.monthly",
                        expiry, true, 42L));
        // 처음엔 없다고 보고 넣다가 막히고, 다시 보면 다른 요청이 넣은 행이 있다
        when(subscriptionRepository.findByPurchaseToken(TOKEN))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(winner));
        when(subscriptionRepository.saveAndFlush(any()))
                .thenThrow(new DataIntegrityViolationException("uk_subscriptions_purchase_token"));

        service.sync(TOKEN);

        verify(subscriptionRepository, times(1)).saveAndFlush(any());
        assertThat(winner.getExpiresAt()).isEqualTo(expiry);
        // 구독 시작은 이긴 쪽이 이미 남겼다 — 두 번 세면 결제 퍼널이 부풀려진다
        verify(eventLogService, never()).log(any(Long.class), anyString(), anyString());
    }

    @Test
    void 새로_만들면_구독_시작을_한_번_남긴다() {
        when(subscriptionRepository.findByPurchaseToken(TOKEN)).thenReturn(Optional.empty());
        when(apiClient.fetch(TOKEN))
                .thenReturn(new GooglePlaySubscriptionState(SubscriptionStatus.ACTIVE, "pro.monthly",
                        LocalDateTime.now().plusMonths(1), true, 42L));

        service.sync(TOKEN);

        verify(eventLogService, times(1)).log(42L, com.fitto.common.analytics.AnalyticsEvent.SUBSCRIPTION_STARTED,
                Store.GOOGLE_PLAY.name());
    }
}
