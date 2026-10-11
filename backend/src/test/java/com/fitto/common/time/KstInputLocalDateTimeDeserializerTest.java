package com.fitto.common.time;

import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 사용자가 고른 시각의 역직렬화 — 운영(UTC JVM) 조건을 시간대를 인자로 넘겨 재현한다.
 * 테스트 JVM 은 Asia/Seoul 이라 JVM 기본값에 기대면 9시간 밀림(예약 전송 버그)이 보이지 않는다.
 */
class KstInputLocalDateTimeDeserializerTest {

    private static final ZoneId UTC = ZoneOffset.UTC;

    @Test
    void 오프셋_없는_값은_KST_로_읽어_UTC_서버_시각으로_바꾼다() {
        // 1.0.6 이하 앱: 한국에서 "저녁 9시"를 고르면 오프셋 없이 이렇게 온다
        assertThat(KstInputLocalDateTimeDeserializer.toServerTime("2026-10-03T21:00:00", UTC))
                .isEqualTo(LocalDateTime.of(2026, 10, 3, 12, 0));
    }

    @Test
    void 자정_전후로_날짜가_넘어가도_같은_순간이다() {
        assertThat(KstInputLocalDateTimeDeserializer.toServerTime("2026-10-04T08:30:00", UTC))
                .isEqualTo(LocalDateTime.of(2026, 10, 3, 23, 30));
    }

    @Test
    void Z_가_붙은_값은_그_순간_그대로다() {
        // 새 앱: Date.toISOString()
        assertThat(KstInputLocalDateTimeDeserializer.toServerTime("2026-10-03T12:00:00.000Z", UTC))
                .isEqualTo(LocalDateTime.of(2026, 10, 3, 12, 0));
    }

    @Test
    void 명시한_오프셋도_존중한다() {
        assertThat(KstInputLocalDateTimeDeserializer.toServerTime("2026-10-03T21:00:00+09:00", UTC))
                .isEqualTo(LocalDateTime.of(2026, 10, 3, 12, 0));
    }

    @Test
    void 서버가_KST_면_오프셋_없는_값은_그대로다() {
        assertThat(KstInputLocalDateTimeDeserializer.toServerTime("2026-10-03T21:00:00", KstClock.ZONE))
                .isEqualTo(LocalDateTime.of(2026, 10, 3, 21, 0));
    }
}
