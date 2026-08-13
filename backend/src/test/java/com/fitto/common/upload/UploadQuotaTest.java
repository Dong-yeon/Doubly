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
