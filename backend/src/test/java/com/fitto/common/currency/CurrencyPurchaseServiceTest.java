package com.fitto.common.currency;

import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.AppStoreServerApiClient;
import com.fitto.common.plan.GooglePlayDeveloperApiClient;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.StoreProductPurchase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 재화 묶음 검증 — 앱이 보낸 상품·귀속을 믿지 않고 스토어 응답으로 정한다(크레딧 검증과 같은 원칙).
 */
class CurrencyPurchaseServiceTest {

    private static final Long USER = 7L;
    private static final String PACK = CurrencyPack.CURRENCY_39.productId();

    private final CurrencyService currency = mock(CurrencyService.class);
    private final GooglePlayDeveloperApiClient google = mock(GooglePlayDeveloperApiClient.class);
    private final AppStoreServerApiClient apple = mock(AppStoreServerApiClient.class);
    private final CurrencyPurchaseService service =
            new CurrencyPurchaseService(currency, google, apple, mock(EventLogService.class));

    @Test
    void 유효한_Play_결제는_묶음만큼_넣고_승인한다() {
        when(google.fetchProduct(PACK, "tok")).thenReturn(new StoreProductPurchase(PACK, USER, true, false));
        when(currency.grantPurchase(USER, Store.GOOGLE_PLAY, PACK, "tok", 39)).thenReturn(true);

        service.verifyGoogle(USER, PACK, "tok");

        verify(currency).grantPurchase(USER, Store.GOOGLE_PLAY, PACK, "tok", 39);
        verify(google).acknowledgeProduct(PACK, "tok");
    }

    @Test
    void 스토어가_돌려준_상품이_다르면_넣지_않는다() {
        when(apple.fetchTransaction("tx")).thenReturn(new StoreProductPurchase("currency_299", USER, true));

        assertThatThrownBy(() -> service.verifyApple(USER, PACK, "tx")).isInstanceOf(BusinessException.class);
        verify(currency, never()).grantPurchase(any(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void 다른_계정의_결제는_넣지_않는다() {
        when(apple.fetchTransaction("tx")).thenReturn(new StoreProductPurchase(PACK, 99L, true));

        assertThatThrownBy(() -> service.verifyApple(USER, PACK, "tx"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        verify(currency, never()).grantPurchase(any(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void 없는_묶음이나_완료되지_않은_결제는_거절한다() {
        assertThatThrownBy(() -> service.verifyGoogle(USER, "emoji_set_1", "tok")).isInstanceOf(BusinessException.class);
        when(google.fetchProduct(PACK, "tok")).thenReturn(new StoreProductPurchase(PACK, USER, false, false));
        assertThatThrownBy(() -> service.verifyGoogle(USER, PACK, "tok")).isInstanceOf(BusinessException.class);
        verify(currency, never()).grantPurchase(any(), any(), anyString(), anyString(), anyLong());
    }

    @Test
    void 환불_알림은_우리가_준_거래이고_스토어가_확인해줄_때만_회수한다() {
        // 우리가 준 적 없는 거래 — 스토어에 묻지도 않는다
        when(currency.isCurrencyPurchase("other")).thenReturn(false);
        service.revokeIfVoidedOnGooglePlay("other");
        verify(google, never()).isVoided("other");

        // 우리 거래지만 스토어가 무효가 아니라고 한다(알림 본문을 믿지 않는다)
        when(currency.isCurrencyPurchase("tok")).thenReturn(true);
        when(google.isVoided("tok")).thenReturn(false);
        service.revokeIfVoidedOnGooglePlay("tok");
        verify(currency, never()).revokePurchase("tok");

        when(google.isVoided("tok")).thenReturn(true);
        service.revokeIfVoidedOnGooglePlay("tok");
        verify(currency).revokePurchase("tok");

        when(currency.isCurrencyPurchase("tx")).thenReturn(true);
        when(apple.fetchTransaction("tx")).thenReturn(new StoreProductPurchase(PACK, USER, false));
        service.revokeIfRefundedOnAppStore("tx");
        verify(currency).revokePurchase("tx");
    }
}
