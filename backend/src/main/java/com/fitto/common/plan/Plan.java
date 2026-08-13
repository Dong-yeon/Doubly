package com.fitto.common.plan;

/**
 * 요금제 — 무료 / 유료.
 *
 * <p>선언 순서가 곧 등급이다({@link #ordinal()}). 등급 비교는 {@link #isAtLeast}·{@link #max}
 * 를 쓰고 {@code ==} 로 하지 않는다 — 중간 등급(예: PLUS)이 생겨도 호출부가 안 깨진다.
 */
public enum Plan {

    FREE,
    PRO;

    public boolean isAtLeast(Plan other) {
        return this.ordinal() >= other.ordinal();
    }

    /**
     * 더 높은 등급을 고른다.
     *
     * <p>커플 공간의 등급 판정에 쓴다 — 한쪽만 결제해도 <b>둘 다</b> PRO 로 쓴다.
     * 콘텐츠가 {@code couple_id} 에 매달려 있어서, 같은 피드/여행을 한 사람은 보고
     * 한 사람은 못 보게 만들면 커플 앱이 성립하지 않기 때문이다.
     */
    public static Plan max(Plan a, Plan b) {
        return a.ordinal() >= b.ordinal() ? a : b;
    }
}
