package com.fitto.mood.service;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 저장 TZ 가 UTC 인 운영에서의 날짜 경계 — 테스트 JVM 은 KST 라 통합 테스트로는 드러나지 않는다.
 * 스프링 없이 계산만 본다.
 */
class MoodCalendarZoneTest {

    @Test
    void 운영처럼_UTC_로_저장되면_KST_하루는_전날_15시에_시작한다() {
        MoodCalendarService service = new MoodCalendarService(null, null, null, null, "UTC");
        assertThat(service.storageStartOfDay(LocalDate.of(2026, 10, 2)))
                .isEqualTo(LocalDateTime.of(2026, 10, 1, 15, 0));
    }

    @Test
    void 저장_TZ_가_KST_면_그대로다() {
        MoodCalendarService service = new MoodCalendarService(null, null, null, null, "Asia/Seoul");
        assertThat(service.storageStartOfDay(LocalDate.of(2026, 10, 2)))
                .isEqualTo(LocalDateTime.of(2026, 10, 2, 0, 0));
    }
}
