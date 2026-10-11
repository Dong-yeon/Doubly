package com.fitto.common.plan;

/**
 * 플랜 비교 화면 한 줄 — FREE 와 PRO 의 한도를 나란히.
 *
 * <p>{@link FeatureState} 와 나누는 이유: 저것은 <b>지금 내 상태</b>(쓸 수 있나·몇 번 남았나)라
 * 요청마다 달라지고, 이것은 <b>상품 설명</b>이라 배포 전까지 고정이다. 한 DTO 에 합치면
 * 게이팅에 쓰이는 응답이 상품 카탈로그까지 짊어지게 된다.
 *
 * <p>그래도 <b>숫자는 여전히 서버가 준다</b>. 앱에 "사진 60장"을 박아두면 한도를 조정할 때마다
 * 스토어 심사를 기다려야 한다({@code FeatureState} 주석과 같은 이유).
 *
 * @param feature     {@link Feature} 이름 — 앱이 키로 쓴다
 * @param name        사용자에게 보여줄 기능 이름
 * @param group       묶음 — {@link FeatureGroup} 이름
 * @param groupName   묶음의 한국어 이름 (앱이 섹션 제목으로 그대로 쓴다)
 * @param freeLimit   FREE 한도. {@code -1} 무제한, {@code 0} 차단
 * @param freePeriod  FREE 한도 주기 — DAY / WEEK / MONTH / TOTAL / NONE
 * @param proLimit    PRO 한도
 * @param proPeriod   PRO 한도 주기
 * @param coupleScoped 커플이 함께 쓰는 한도인가 — "둘이 합쳐"라고 써야 오해가 없다
 * @param hero        PRO 대표 기능 세 개 중 하나인가({@link Feature#isHero()}) — 앱이 비교표
 *                    맨 위로 끌어올린다. 30줄을 다 읽고 결제하는 사람은 없다
 */
public record PlanCatalogEntry(
        String feature,
        String name,
        String group,
        String groupName,
        int freeLimit,
        String freePeriod,
        int proLimit,
        String proPeriod,
        boolean coupleScoped,
        boolean hero
) {

    static PlanCatalogEntry of(Feature feature) {
        Quota free = feature.free();
        Quota pro = feature.pro();
        return new PlanCatalogEntry(
                feature.name(),
                feature.displayName(),
                feature.group().name(),
                feature.group().displayName(),
                free.limit(),
                free.window().name(),
                pro.limit(),
                pro.window().name(),
                feature.isCoupleScoped(),
                feature.isHero()
        );
    }
}
