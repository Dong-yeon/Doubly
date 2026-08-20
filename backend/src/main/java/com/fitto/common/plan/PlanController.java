package com.fitto.common.plan;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * 플랜 조회 + 구매 직후 즉시 검증.
 *
 * <p><b>왜 {@code /auth/me} 에 얹지 않았나</b>: {@code UserResponse} 는 커플 상대
 * ({@code RelationResponse.partner})와 트레이너 회원 목록에도 그대로 실려 나간다.
 * 거기에 플랜을 넣으면 <b>남의 구독 여부가 노출</b>된다. 그리고 결제 직후에는 플랜만
 * 다시 받으면 되는데, 그 때문에 프로필 전체를 재조회할 이유도 없다.
 */
@RestController
@RequestMapping("/api/v1/plan")
public class PlanController {

    private final PlanGuard planGuard;
    private final GooglePlaySubscriptionSyncService googlePlaySyncService;

    public PlanController(PlanGuard planGuard, GooglePlaySubscriptionSyncService googlePlaySyncService) {
        this.planGuard = planGuard;
        this.googlePlaySyncService = googlePlaySyncService;
    }

    @GetMapping("/me")
    public ApiResponse<PlanResponse> me(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(currentPlanOf(user));
    }

    /**
     * 인앱결제 완료 직후 클라이언트가 부른다.
     *
     * <p>같은 상태 판정을 스토어 웹훅(RTDN)도 결국 하게 되지만, 그건 몇 초~몇 분 지연될 수
     * 있다({@link GooglePlayWebhookController} 참고) — 결제하자마자 PRO가 안 열리면
     * 사용자는 결제가 실패한 줄 안다. 그래서 클라이언트가 purchaseToken 을 받은 즉시 같은
     * 동기화 로직({@link GooglePlaySubscriptionSyncService})을 먼저 태워 반영한다.
     *
     * <p>인증은 필요하지만 <b>귀속 판정에는 쓰지 않는다</b> — 실제로 어느 사용자 것인지는
     * Play Developer API 가 돌려주는 {@code obfuscatedAccountId} 로만 정해진다(로그인한
     * 사람이 남의 purchaseToken 을 보내도 자기 계정에 PRO 가 붙지 않는다). 여기서는
     * "지금 이 사람이 방금 결제했다"는 트리거로만 쓴다.
     */
    @PostMapping("/purchases/google")
    public ApiResponse<PlanResponse> verifyGooglePurchase(@AuthenticationPrincipal AuthUser user,
                                                            @RequestBody GooglePurchaseVerifyRequest request) {
        if (request == null || request.purchaseToken() == null || request.purchaseToken().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
        googlePlaySyncService.sync(request.purchaseToken());
        return ApiResponse.success(currentPlanOf(user));
    }

    private PlanResponse currentPlanOf(AuthUser user) {
        List<FeatureState> features = Arrays.stream(Feature.values())
                .filter(feature -> feature != Feature.AI_TOTAL)   // 내부 안전망 — 표시하지 않는다
                .map(feature -> planGuard.state(user.id(), feature))
                .toList();
        return new PlanResponse(planGuard.planOf(user.id()), planGuard.isFreeTrial(), features);
    }
}
