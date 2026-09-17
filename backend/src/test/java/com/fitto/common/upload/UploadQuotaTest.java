package com.fitto.common.upload;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.Subscription;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.SubscriptionStatus;
import com.fitto.common.security.AuthUser;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 사진 업로드 한도 — 서명 발급 시점에 센다.
 *
 * <p>업로드 자체는 앱이 Cloudinary 로 직접 보내므로, 서버가 개입할 수 있는 지점은
 * 서명 발급뿐이다. 테스트가 Cloudinary 설정을 채우는 이유는 미설정이면 한도 판정
 * 전에 503 으로 끝나기 때문이다.
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        // 가입 직후 N일 체험을 끈다 — 여기서 검증하는 건 사진 한도이지 체험이 아니다.
        "fitto.plan.trial-days=0",
        "fitto.cloudinary.cloud-name=test-cloud",
        "fitto.cloudinary.api-key=test-key",
        "fitto.cloudinary.api-secret=test-secret"
})
@ActiveProfiles("test")
class UploadQuotaTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    UploadController uploadController;
    @Autowired
    SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private AuthUser principal(Long userId) {
        return new AuthUser(userId, Role.USER);
    }

    private void givePro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("upload-token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    @Test
    void 한도_안에서는_서명이_발급된다() {
        Long user = register("upload-ok@fitto.com");

        UploadSignatureResponse signature = uploadController.signature(principal(user)).data();

        assertThat(signature.cloudName()).isEqualTo("test-cloud");
        assertThat(signature.signature()).isNotBlank();
    }

    @Test
    void 무료_월_한도를_넘기면_서명이_거부된다() {
        Long user = register("upload-limit@fitto.com");
        int limit = Feature.PHOTO_UPLOAD.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            uploadController.signature(principal(user));
        }

        assertThatThrownBy(() -> uploadController.signature(principal(user)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    /**
     * 한도는 커플이 한 주머니로 쓴다 — 한 명이 다 쓰면 상대도 막힌다.
     *
     * <p>사진은 커플 공간에 쌓이고 보통 한 명이 주로 찍는다. 사람마다 따로 세면 같은 앨범을
     * 보면서 한쪽만 먼저 막히는데, 그 상태를 사용자는 이해할 수 없다(PlanGuard.scopeOf).
     */
    @Test
    void 사진_한도는_커플이_함께_쓴다() {
        Long a = register("upload-pool-a@fitto.com");
        Long b = register("upload-pool-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        int limit = Feature.PHOTO_UPLOAD.quotaFor(Plan.FREE).limit();
        // A 가 한도를 통째로 쓴다
        for (int i = 0; i < limit; i++) {
            uploadController.signature(principal(a));
        }

        // B 는 한 장도 안 올렸지만 주머니가 비었다
        assertThatThrownBy(() -> uploadController.signature(principal(b)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    /** 커플이 없으면 본인 주머니로 떨어진다 — 판정과 같은 폴백이다. */
    @Test
    void 커플이_없으면_각자_주머니를_쓴다() {
        Long solo1 = register("upload-solo1@fitto.com");
        Long solo2 = register("upload-solo2@fitto.com");
        int limit = Feature.PHOTO_UPLOAD.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            uploadController.signature(principal(solo1));
        }

        // 남남이라 solo1 이 다 써도 solo2 는 멀쩡하다
        assertThatCode(() -> uploadController.signature(principal(solo2)))
                .doesNotThrowAnyException();
    }

    @Test
    void 상대가_PRO면_무료_한도를_넘어도_올릴_수_있다() {
        // 사진은 대부분 커플 콘텐츠(피드·앨범)라 커플 단위로 판정한다.
        Long a = register("upload-couple-a@fitto.com");
        Long b = register("upload-couple-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        givePro(a);

        int freeLimit = Feature.PHOTO_UPLOAD.quotaFor(Plan.FREE).limit();
        for (int i = 0; i < freeLimit; i++) {
            uploadController.signature(principal(b));
        }

        assertThatCode(() -> uploadController.signature(principal(b)))
                .doesNotThrowAnyException();
    }
}
