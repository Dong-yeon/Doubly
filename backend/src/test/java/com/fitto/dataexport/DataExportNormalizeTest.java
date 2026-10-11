package com.fitto.dataexport;

import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.util.Map;
import java.util.TimeZone;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 내보내기 시각은 KST 벽시계여야 한다 — 운영 JVM 은 UTC 라 DB 값이 UTC 벽시계로 저장된다.
 * 테스트 JVM 은 KST 로 고정돼 있어 그대로는 차이가 안 보이므로, 여기서만 기본 TZ 를 UTC 로 바꾼다.
 */
class DataExportNormalizeTest {

    @Test
    void 운영처럼_UTC_로_저장된_시각을_KST_로_내보낸다() {
        TimeZone original = TimeZone.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
            // 드라이버는 timestamp 를 JVM 기본 TZ 로 해석해 Timestamp 를 만든다
            Timestamp storedUtc = Timestamp.valueOf("2026-10-01 14:00:00");

            Map<String, Object> row = DataExportService.normalize(Map.of("CREATED_AT", storedUtc));

            assertThat(row.get("created_at")).isEqualTo("2026-10-01T23:00");
        } finally {
            TimeZone.setDefault(original);
        }
    }

    @Test
    void KST_JVM_에서는_값이_그대로다() {
        Timestamp storedKst = Timestamp.valueOf("2026-10-01 23:00:00");

        Map<String, Object> row = DataExportService.normalize(Map.of("CREATED_AT", storedKst));

        assertThat(row.get("created_at")).isEqualTo("2026-10-01T23:00");
    }
}
