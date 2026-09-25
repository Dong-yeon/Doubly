package com.fitto.common.plan;

/**
 * 앱에 내려주는 기능별 상태.
 *
 * <p><b>앱은 한도를 하드코딩하지 않는다.</b> 숫자를 바꿀 때마다 스토어 심사를 기다려야
 * 하면 가격 정책을 실험할 수 없다. 판정도 표시도 서버가 하고, 앱은 받은 값을 그린다.
 *
 * @param feature   {@link Feature} 이름 (앱이 키로 쓴다)
 * @param name      사용자에게 보여줄 기능 이름
 * @param allowed   지금 쓸 수 있는가
 * @param limit     한도. {@code -1} 무제한, {@code 0} 차단
 * @param used      이번 기간 사용량 (개수형·무제한이면 0)
 * @param remaining 잔여 횟수. 무제한·차단·개수형이면 {@code null}
 * @param period    한도 주기 — DAY / WEEK / MONTH / TOTAL / NONE
 * @param upgradable 이 잠금이 <b>결제로 풀리는가</b> — {@code false} 면 업그레이드를 권하지 않는다.
 *                   {@code allowed=false} 에는 두 가지가 섞여 있다: 플랜이 낮아서 막힌 것과,
 *                   이미 PRO 인데 이번 기간 한도를 다 쓴 것. 실행 시점에는
 *                   {@code PlanGuard.limitExceeded} 가 이 둘을 402/429 로 갈라 주지만,
 *                   <b>화면이 미리 그리는 잠금 표시에는 그 구분이 없어서</b> PRO 사용자에게
 *                   결제를 다시 권하는 문구가 떴다(우리 이모지 월 4회 소진 시). 같은 근거
 *                   ({@code plan.isAtLeast(PRO)})를 여기서도 내려보내 표시와 실행을 맞춘다.
 * @param credits   따로 산 크레딧 잔량({@link FeatureCredit}). 이 기능이 크레딧을 팔지 않으면 0.
 *                  {@code remaining} 에는 이미 합산돼 있다 — 화면은 "그중 N회는 산 것"을 말할 때만 쓴다
 */
public record FeatureState(
        String feature,
        String name,
        boolean allowed,
        int limit,
        int used,
        Integer remaining,
        String period,
        boolean upgradable,
        int credits
) {
}
