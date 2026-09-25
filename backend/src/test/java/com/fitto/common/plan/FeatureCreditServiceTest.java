package com.fitto.common.plan;

import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 크레딧 결제 검증 — 스토어 응답을 대조하는 규칙만 본다(스프링 컨텍스트 없이).
 *
 * <p>지키는 것: 앱이 말한 상품이 아니라 스토어가 돌려준 상품과 귀속으로 판정한다, 같은 거래는
 * 두 번 주지 않는다, 스토어 조회가 안 되면 조용히 넘기지 않고 거절한다(사용자가 방금 결제를
 * 누른 자리라 침묵이 최악이다).
 */
@ExtendWith(MockitoExtension.class)
class FeatureCreditServiceTest {

    private static final long USER = 42L;
    private static final String PRODUCT = CreditProduct.EMOJI_SET_1.productId();

    @Mock FeatureCreditRepository repository;
    @Mock GooglePlayDeveloperApiClient googlePlayClient;
    @Mock AppStoreServerApiClient appStoreClient;
    @Mock EventLogService eventLogService;

    FeatureCreditService service;

    @BeforeEach
    void setUp() {
        service = new FeatureCreditService(repository, googlePlayClient, appStoreClient, eventLogService);
    }

    @Test
    void 스토어가_확인한_결제면_크레딧을_주고_기록한다() {
        when(googlePlayClient.fetchProduct(PRODUCT, "token")).thenReturn(new StoreProductPurchase(PRODUCT, USER, true));
        when(repository.findByTransactionId("token")).thenReturn(Optional.empty());

        assertThat(service.verifyGoogle(USER, PRODUCT, "token")).isEqualTo(1);

        verify(repository).save(any(FeatureCredit.class));
        verify(eventLogService).log(USER, com.fitto.common.analytics.AnalyticsEvent.CREDIT_PURCHASED, PRODUCT);
    }

    @Test
    void 같은_거래가_다시_오면_주지_않고_성공으로_답한다() {
        when(googlePlayClient.fetchProduct(PRODUCT, "token")).thenReturn(new StoreProductPurchase(PRODUCT, USER, true));
        when(repository.findByTransactionId("token")).thenReturn(Optional.of(
                FeatureCredit.builder().userId(USER).feature(Feature.AI_COUPLE_EMOJI).store(Store.GOOGLE_PLAY)
                        .productId(PRODUCT).transactionId("token").credits(1).build()));

        assertThat(service.verifyGoogle(USER, PRODUCT, "token")).isEqualTo(1);
        verify(repository, never()).save(any());
    }

    @Test
    void 다른_계정의_결제는_붙이지_않는다() {
        when(appStoreClient.fetchTransaction("tx")).thenReturn(new StoreProductPurchase(PRODUCT, 7L, true));

        assertThatThrownBy(() -> service.verifyApple(USER, PRODUCT, "tx"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        verify(repository, never()).save(any());
    }

    @Test
    void 스토어가_돌려준_상품이_다르면_거절한다() {
        when(appStoreClient.fetchTransaction("tx")).thenReturn(new StoreProductPurchase("pro_monthly", USER, true));

        assertThatThrownBy(() -> service.verifyApple(USER, PRODUCT, "tx"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 스토어_조회가_안_되면_조용히_넘기지_않는다() {
        when(googlePlayClient.fetchProduct(anyString(), anyString())).thenReturn(null);

        assertThatThrownBy(() -> service.verifyGoogle(USER, PRODUCT, "token"))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 모르는_상품_id는_스토어에_묻기_전에_거절한다() {
        assertThatThrownBy(() -> service.verifyGoogle(USER, "sticker_pack_x", "token"))
                .isInstanceOf(BusinessException.class);
        verify(googlePlayClient, never()).fetchProduct(anyString(), anyString());
    }
}
