package com.fitto.place.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 럽슐랭 등급 산정 로직 — 스프링 컨텍스트 없이 순수 단위 테스트.
 * <p>
 * 산정 규칙: 둘 다 평가해야 하고, 한쪽이라도 2점 이하면 탈락(0). 평균 5.0(둘 다 5점)이면
 * 3, 4.0~4.9 면 2, 나머지(3점 이상 조합이므로 항상 3.0~3.9)는 1.
 */
class PlaceLovelichelinTierTest {

    @ParameterizedTest(name = "나={0}, 상대={1} → tier {2}")
    @CsvSource({
            "5, 5, 3", // 둘 다 5점 → 3 럽스타
            "4, 5, 2", // 평균 4.5 → 2 럽스타
            "4, 4, 2", // 평균 4.0 → 2 럽스타
            "3, 4, 1", // 평균 3.5 → 1 럽스타
            "3, 3, 1", // 평균 3.0 → 1 럽스타
            "2, 5, 0", // 한쪽이 2점 이하 → 탈락
            "1, 5, 0",
            "2, 2, 0",
    })
    void 두_점수_모두_있으면_규칙대로_등급이_산정된다(int my, int partner, int expectedTier) {
        assertThat(PlaceService.computeTier(my, partner)).isEqualTo(expectedTier);
    }

    @Test
    void 한쪽이라도_평가하지_않았으면_등급은_0이다() {
        assertThat(PlaceService.computeTier(null, 5)).isZero();
        assertThat(PlaceService.computeTier(5, null)).isZero();
        assertThat(PlaceService.computeTier(null, null)).isZero();
    }

    @Test
    void 등급은_방향에_상관없이_대칭이다() {
        assertThat(PlaceService.computeTier(4, 5)).isEqualTo(PlaceService.computeTier(5, 4));
        assertThat(PlaceService.computeTier(2, 5)).isEqualTo(PlaceService.computeTier(5, 2));
    }
}
