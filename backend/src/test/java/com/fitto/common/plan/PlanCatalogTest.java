package com.fitto.common.plan;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 플랜 비교 카탈로그 — 순수 로직이라 스프링 없이 본다.
 *
 * <p>{@code Feature.group()} 이 모든 상수를 덮는지는 switch 가 exhaustive 라 컴파일러가
 * 이미 보장한다. 여기서 보는 건 <b>화면에 무엇이 나가고 무엇이 빠지는가</b>다.
 */
class PlanCatalogTest {

    @Test
    void 두_플랜의_한도가_같은_기능은_비교표에서_빠진다() {
        Set<Feature> hidden = Arrays.stream(Feature.values())
                .filter(feature -> !feature.isComparable())
                .collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(Feature.class)));

        // AI_TOTAL 은 플랜과 무관한 내부 안전망, COUPLE_GAME 은 게이팅이 없다, CSV_EXPORT(기록
        // 내보내기)는 "결제로 풀지 않는다" 원칙상 같은 한도다(docs/DATA_EXPORT_2026-10-01.md).
        // 나중에 한도가 갈라지면 저절로 화면에 나타나야 하므로 이름이 아니라 값으로 판정한다.
        assertThat(hidden).containsExactlyInAnyOrder(Feature.AI_TOTAL, Feature.COUPLE_GAME, Feature.CSV_EXPORT);
    }

    @Test
    void 앱에서_내린_영상통화는_비교표에_오르지_않지만_게이트는_남는다() {
        // 1.0.4 는 아직 통화 API 를 부른다 — 한도(FREE 차단·PRO 무제한)는 그대로여야 한다.
        assertThat(Feature.VIDEO_CALL.isComparable()).isTrue();
        assertThat(Feature.VIDEO_CALL.isListed()).isFalse();
        assertThat(Arrays.stream(Feature.values()).filter(Feature::isWithdrawn))
                .containsExactly(Feature.VIDEO_CALL);
    }

    @Test
    void 비교표에_올라가는_기능은_모두_묶음과_이름을_가진다() {
        for (Feature feature : Feature.values()) {
            if (!feature.isListed()) continue;
            PlanCatalogEntry entry = PlanCatalogEntry.of(feature);

            assertThat(entry.name()).isNotBlank();
            assertThat(entry.groupName()).isNotBlank();
            assertThat(entry.group()).isEqualTo(feature.group().name());
            assertThat(entry.feature()).isEqualTo(feature.name());
        }
    }

    @Test
    void 차단과_무제한이_한도_숫자로_구분된다() {
        // 앱이 -1(무제한)·0(차단)을 문구로 바꾼다 — 이 약속이 깨지면 "0회"가 그대로 보인다.
        PlanCatalogEntry videoCall = PlanCatalogEntry.of(Feature.VIDEO_CALL);
        assertThat(videoCall.freeLimit()).isZero();
        assertThat(videoCall.proLimit()).isEqualTo(Quota.UNLIMITED);

        PlanCatalogEntry photo = PlanCatalogEntry.of(Feature.PHOTO_UPLOAD);
        assertThat(photo.freePeriod()).isEqualTo("MONTH");
        assertThat(photo.coupleScoped()).isTrue();
    }

    @Test
    void 묶음은_다섯_개_모두_쓰인다() {
        Set<FeatureGroup> used = Arrays.stream(Feature.values())
                .filter(Feature::isListed)
                .map(Feature::group)
                .collect(java.util.stream.Collectors.toCollection(() -> EnumSet.noneOf(FeatureGroup.class)));

        // 빈 섹션이 화면에 생기면 그 자리가 비어 보인다 — 묶음을 늘릴 때 같이 채우게 한다.
        assertThat(used).containsExactlyInAnyOrder(FeatureGroup.values());
    }
}
