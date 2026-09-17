package com.fitto.common.plan;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 현재 내 플랜과 기능별 한도 — {@code GET /api/v1/plan/me}
 *
 * @param plan      지금 적용되는 등급 (커플 기능은 상대의 구독으로 올라갈 수 있다)
 * @param freeTrial   체험 중인가 — {@code true} 면 앱이 "체험 중" 배지를 띄운다.
 *                    전역 플래그(출시 초기, 전원)와 가입 후 N일이 합쳐진 값이다.
 * @param trialEndsAt 체험이 끝나는 시각. 전역 체험 중이거나 체험이 없으면 {@code null} —
 *                    끝이 정해져 있지 않은데 날짜를 주면 앱이 없는 마감을 안내하게 된다
 * @param features    기능별 한도·사용량
 */
public record PlanResponse(
        Plan plan,
        boolean freeTrial,
        LocalDateTime trialEndsAt,
        List<FeatureState> features
) {
}
