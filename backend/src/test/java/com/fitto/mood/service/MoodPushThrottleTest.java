package com.fitto.mood.service;

import com.fitto.mood.domain.MoodStatus;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/** 무드 푸시 간격(10분) — 연달아 고쳐 고를 때 상대 폰이 매번 울리지 않게. 스프링 없이 판정만 본다. */
class MoodPushThrottleTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 2, 21, 0);

    private static MoodStatus previous(LocalDateTime at, String message) {
        MoodStatus status = MoodStatus.builder().coupleId(1L).userId(1L).emoji("😊").message(message).build();
        ReflectionTestUtils.setField(status, "createdAt", at);
        return status;
    }

    @Test
    void 처음_고른_무드는_보낸다() {
        assertThat(MoodService.shouldPush(null, null, NOW)).isTrue();
    }

    @Test
    void 십분_안에_다시_바꾸면_보내지_않는다() {
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(3), null), null, NOW)).isFalse();
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(9).minusSeconds(59), null), null, NOW)).isFalse();
    }

    @Test
    void 십분이_지나면_다시_보낸다() {
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(10), null), null, NOW)).isTrue();
        assertThat(MoodService.shouldPush(previous(NOW.minusHours(2), "아까 말"), null, NOW)).isTrue();
    }

    @Test
    void 간격_안이어도_새_한마디가_붙으면_보낸다() {
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(1), null), "보고 싶어", NOW)).isTrue();
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(1), "야근 중"), "곧 끝나", NOW)).isTrue();
    }

    @Test
    void 같은_한마디로_이모지만_바꾼_건_새_말이_아니다() {
        assertThat(MoodService.shouldPush(previous(NOW.minusMinutes(1), "야근 중"), "야근 중", NOW)).isFalse();
    }
}
