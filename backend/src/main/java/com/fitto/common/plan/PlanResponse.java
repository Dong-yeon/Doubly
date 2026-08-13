package com.fitto.common.plan;

import java.util.List;

/**
 * 현재 내 플랜과 기능별 한도 — {@code GET /api/v1/plan/me}
 *
 * @param plan      지금 적용되는 등급 (커플 기능은 상대의 구독으로 올라갈 수 있다)
 * @param freeTrial 무료 체험 기간인가 — {@code true} 면 앱이 "체험 중" 배지를 띄운다
 * @param features  기능별 한도·사용량
 */
public record PlanResponse(
        Plan plan,
        boolean freeTrial,
        List<FeatureState> features
) {
}
