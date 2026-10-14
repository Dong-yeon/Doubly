package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 광고 제거 판정 + 영구권 검증·복원·환불 — docs/DUBLY_PLUS_PLAN_2026-10-14.md S2.
 *
 * <p>스토어 클라이언트만 가짜로 두고 저장소·판정은 진짜를 쓴다. 가짜를 {@code @MockitoBean} 으로 꽂으면 스프링 컨텍스트가 하나
 * 더 생겨 JVM 끝까지 캐시되므로(CLAUDE.md §6) 서비스를 직접 조립한다 — 컨텍스트는 {@code PlanGatingFlowTest} 와 같은 것을 쓴다.
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0"})
@ActiveProfiles("test")
class AdFreeLifetimeFlowTest {

    private static final String IP = "127.0.0.1";
    private static final String LIFETIME = LifetimeProduct.PLUS_LIFETIME.productId();

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired UserEntitlementRepository entitlementRepository;
    @Autowired SubscriptionRepository subscriptionRepository;
    @Autowired AdFreeResolver adFree;
    @Autowired PlanChangeNotifier planChangeNotifier;
    @Autowired PlanProperties planProperties;
    @Autowired com.fitto.auth.service.UserDataPurger userDataPurger;

    private final GooglePlayDeveloperApiClient google = mock(GooglePlayDeveloperApiClient.class);
    private final AppStoreServerApiClient apple = mock(AppStoreServerApiClient.class);

    private EntitlementPurchaseService service() {
        return new EntitlementPurchaseService(entitlementRepository, google, apple, mock(EventLogService.class),
                planChangeNotifier);
    }

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    private Long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new Long[]{a, b};
    }

    private void googleSays(String token, Long owner, boolean valid) {
        when(google.fetchProduct(LIFETIME, token)).thenReturn(new StoreProductPurchase(LIFETIME, owner, valid, false));
    }

    @Test
    void 영구권을_사면_나와_상대_모두_광고가_꺼진다() {
        Long[] c = couple("adfree-buy-a@fitto.com", "adfree-buy-b@fitto.com");
        assertThat(adFree.sourceOf(c[0])).isEqualTo(AdFreeResolver.Source.NONE);

        googleSays("adfree-tok-1", c[0], true);
        service().verifyGoogle(c[0], LIFETIME, "adfree-tok-1");

        assertThat(adFree.sourceOf(c[0])).isEqualTo(AdFreeResolver.Source.SELF_LIFETIME);
        assertThat(adFree.sourceOf(c[1])).isEqualTo(AdFreeResolver.Source.PARTNER);
        assertThat(adFree.ownsLifetime(c[0])).isTrue();
        assertThat(adFree.ownsLifetime(c[1])).isFalse();   // 상대 것은 내 소유가 아니다
        verify(google).acknowledgeProduct(LIFETIME, "adfree-tok-1");   // 승인만 — 소모(consume)하지 않는다
    }

    @Test
    void 복원은_같은_검증을_다시_부르는_것이라_오류_없이_한_행만_남는다() {
        Long user = register("adfree-restore@fitto.com");
        googleSays("adfree-tok-restore", user, true);

        service().verifyGoogle(user, LIFETIME, "adfree-tok-restore");
        assertThatCode(() -> service().verifyGoogle(user, LIFETIME, "adfree-tok-restore")).doesNotThrowAnyException();

        assertThat(entitlementRepository.findAll().stream()
                .filter(e -> e.getTransactionId().equals("adfree-tok-restore"))).hasSize(1);
    }

    @Test
    void 다른_계정의_결제로는_열리지_않는다() {
        Long user = register("adfree-other-a@fitto.com");
        Long other = register("adfree-other-b@fitto.com");
        googleSays("adfree-tok-other", other, true);

        assertThatThrownBy(() -> service().verifyGoogle(user, LIFETIME, "adfree-tok-other"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.FORBIDDEN);
        assertThat(adFree.isAdFree(user)).isFalse();
    }

    @Test
    void 환불되면_광고가_돌아오고_다시_사면_또_꺼진다() {
        Long[] c = couple("adfree-refund-a@fitto.com", "adfree-refund-b@fitto.com");
        googleSays("adfree-tok-refund", c[0], true);
        service().verifyGoogle(c[0], LIFETIME, "adfree-tok-refund");

        // 알림 본문이 아니라 스토어가 무효라고 확인해 줄 때만 거둔다
        when(google.isVoided("adfree-tok-refund")).thenReturn(true);
        service().revokeIfVoidedOnGooglePlay("adfree-tok-refund");
        service().revokeIfVoidedOnGooglePlay("adfree-tok-refund");   // 웹훅 재전송 — 두 번 와도 같다

        assertThat(adFree.sourceOf(c[0])).isEqualTo(AdFreeResolver.Source.NONE);
        assertThat(adFree.sourceOf(c[1])).isEqualTo(AdFreeResolver.Source.NONE);

        googleSays("adfree-tok-rebuy", c[0], true);
        service().verifyGoogle(c[0], LIFETIME, "adfree-tok-rebuy");
        assertThat(adFree.sourceOf(c[0])).isEqualTo(AdFreeResolver.Source.SELF_LIFETIME);
    }

    @Test
    void 애플_환불도_스토어에_되물어_거둔다() {
        Long user = register("adfree-apple@fitto.com");
        when(apple.fetchTransaction("adfree-apple-tx")).thenReturn(new StoreProductPurchase(LIFETIME, user, true));
        service().verifyApple(user, LIFETIME, "adfree-apple-tx");
        assertThat(adFree.isAdFree(user)).isTrue();

        when(apple.fetchTransaction("adfree-apple-tx")).thenReturn(new StoreProductPurchase(LIFETIME, user, false));
        service().revokeIfRefundedOnAppStore("adfree-apple-tx");
        assertThat(adFree.isAdFree(user)).isFalse();
    }

    @Test
    void 구독도_광고를_끄고_상대에게_번진다() {
        Long[] c = couple("adfree-sub-a@fitto.com", "adfree-sub-b@fitto.com");
        subscriptionRepository.save(Subscription.builder()
                .userId(c[1])
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("pro_yearly")
                .purchaseToken("adfree-sub-" + c[1])
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());

        assertThat(adFree.sourceOf(c[1])).isEqualTo(AdFreeResolver.Source.SELF_SUBSCRIPTION);
        assertThat(adFree.sourceOf(c[0])).isEqualTo(AdFreeResolver.Source.PARTNER);
    }

    @Test
    void 체험은_광고를_끄지_않는다() {
        Long user = register("adfree-trial@fitto.com");
        planProperties.setFreeTrial(true);
        try {
            assertThat(planProperties.isFreeTrial()).isTrue();
            assertThat(adFree.isAdFree(user)).isFalse();
        } finally {
            planProperties.setFreeTrial(false);
        }
    }

    @Test
    void 탈퇴하면_영구권_행이_지워진다() {
        // users FK — 빠뜨리면 탈퇴 전체가 FK 위반으로 실패한다
        Long user = register("adfree-purge@fitto.com");
        googleSays("adfree-tok-purge", user, true);
        service().verifyGoogle(user, LIFETIME, "adfree-tok-purge");

        userDataPurger.purgeFor(user);

        assertThat(entitlementRepository.existsByTransactionId("adfree-tok-purge")).isFalse();
    }

    @Test
    void 영구_상품이_아닌_id_는_거절한다() {
        Long user = register("adfree-wrong@fitto.com");
        assertThatThrownBy(() -> service().verifyGoogle(user, "currency_39", "adfree-tok-wrong"))
                .isInstanceOf(BusinessException.class);
    }
}
