package com.fitto.common.plan;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 현재 내 플랜과 기능별 한도 — {@code GET /api/v1/plan/me}
 *
 * @param plan        <b>개인</b> 등급 — 내 구독으로만 정해진다. 개인 기능(AI 음식 분석·심화 통계 등)이
 *                    이 값을 따른다
 * @param couplePlan  커플 기능에 적용되는 등급 — 두 사람 중 높은 쪽(커플이 없으면 {@code plan} 과 같다).
 *                    {@code plan=FREE, couplePlan=PRO} 면 "상대 덕분에 커플 기능은 PRO"다 — 앱이 이걸 보고
 *                    결제를 "내 기능도 열기"로 바꿔 말한다. 개인 플랜만 내려주던 때는 상대 화면이
 *                    그냥 FREE 로 보여 이중 결제를 불렀다
 * @param freeTrial   체험 중인가 — {@code true} 면 앱이 "체험 중" 배지를 띄운다.
 *                    전역 플래그(출시 초기, 전원)와 가입 후 N일이 합쳐진 값이다.
 * @param trialEndsAt 체험이 끝나는 시각. 전역 체험 중이거나 체험이 없으면 {@code null} —
 *                    끝이 정해져 있지 않은데 날짜를 주면 앱이 없는 마감을 안내하게 된다
 * @param features    기능별 한도·사용량
 */
public record PlanResponse(
        Plan plan,
        Plan couplePlan,
        boolean freeTrial,
        LocalDateTime trialEndsAt,
        List<FeatureState> features
) {
}
