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
 */
public record FeatureState(
        String feature,
        String name,
        boolean allowed,
        int limit,
        int used,
        Integer remaining,
        String period
) {
}
