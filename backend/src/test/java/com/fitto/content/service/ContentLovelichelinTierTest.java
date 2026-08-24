package com.fitto.content.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 럽슐랭 등급 산정 로직 — PlaceLovelichelinTierTest 와 완전히 동일한 규칙을 검증한다.
 * (ContentService.computeTier 는 PlaceService.computeTier 를 그대로 미러링한 것 — 별개 파일에서
 * 규칙이 갈라지지 않았는지 확인하는 회귀 테스트.)
 */
class ContentLovelichelinTierTest {

    @ParameterizedTest(name = "나={0}, 상대={1} → tier {2}")
    @CsvSource({
            "5, 5, 3",
            "4, 5, 2",
            "4, 4, 2",
            "3, 4, 1",
            "3, 3, 1",
            "2, 5, 0",
            "1, 5, 0",
            "2, 2, 0",
    })
    void 두_점수_모두_있으면_규칙대로_등급이_산정된다(int my, int partner, int expectedTier) {
        assertThat(ContentService.computeTier(my, partner)).isEqualTo(expectedTier);
    }

    @Test
    void 한쪽이라도_평가하지_않았으면_등급은_0이다() {
        assertThat(ContentService.computeTier(null, 5)).isZero();
        assertThat(ContentService.computeTier(5, null)).isZero();
        assertThat(ContentService.computeTier(null, null)).isZero();
    }

    @Test
    void 등급은_방향에_상관없이_대칭이다() {
        assertThat(ContentService.computeTier(4, 5)).isEqualTo(ContentService.computeTier(5, 4));
        assertThat(ContentService.computeTier(2, 5)).isEqualTo(ContentService.computeTier(5, 2));
    }
}
