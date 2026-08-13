package com.fitto.common.plan;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * 플랜 조회.
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

    public PlanController(PlanGuard planGuard) {
        this.planGuard = planGuard;
    }

    @GetMapping("/me")
    public ApiResponse<PlanResponse> me(@AuthenticationPrincipal AuthUser user) {
        List<FeatureState> features = Arrays.stream(Feature.values())
                .filter(feature -> feature != Feature.AI_TOTAL)   // 내부 안전망 — 표시하지 않는다
                .map(feature -> planGuard.state(user.id(), feature))
                .toList();
        return ApiResponse.success(
                new PlanResponse(planGuard.planOf(user.id()), planGuard.isFreeTrial(), features));
    }
}
