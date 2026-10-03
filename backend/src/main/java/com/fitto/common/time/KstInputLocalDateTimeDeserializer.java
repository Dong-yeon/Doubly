package com.fitto.common.time;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;

import java.io.IOException;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/**
 * 사용자가 <b>시계를 보고 고른 시각</b>을 받는 필드 전용 역직렬화 — 오프셋 없는 값은 KST 로 읽는다.
 *
 * <p>전역 규칙({@code JacksonConfig})은 오프셋 없는 문자열을 UTC 로 읽는다. 서버가 내려준 값을
 * 되돌려 받는 자리에는 맞지만, 사람이 고른 "저녁 9시"에는 틀리다 — 앱이 기기 현지 시각을
 * 오프셋 없이 보내면(예약 전송, 1.0.6 이하 앱) KST 21:00 이 UTC 21:00 = KST 다음 날 06:00 으로
 * 저장돼 <b>9시간 늦게</b> 나갔다(docs/chat-current-state.md §8-1 T1).
 *
 * <ul>
 *   <li>오프셋이 있으면({@code ...Z}, {@code ...+09:00}) 그 순간 그대로 — 새 앱은 이 형식으로 보낸다.</li>
 *   <li>없으면 KST 벽시계로 본다 — 이 앱의 하루는 정의상 KST 다(KstClock).</li>
 * </ul>
 *
 * <p>결과는 <b>서버 JVM 시간대</b>의 LocalDateTime 이다. 스위퍼가 {@code LocalDateTime.now()} 와
 * 비교하므로 그 기준과 같아야 한다 — 운영은 UTC, 테스트 JVM 은 Asia/Seoul 이다. 전역 규칙처럼
 * UTC 를 박아 두면 테스트에서만 9시간 어긋난다.
 */
public class KstInputLocalDateTimeDeserializer extends JsonDeserializer<LocalDateTime> {

    @Override
    public LocalDateTime deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        String text = p.getValueAsString();
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return toServerTime(text.trim(), ZoneId.systemDefault());
        } catch (java.time.DateTimeException e) {
            return (LocalDateTime) ctxt.handleWeirdStringValue(LocalDateTime.class, text, e.getMessage());
        }
    }

    /** 시간대를 인자로 받는 본체 — 테스트가 운영(UTC) 조건을 JVM 시간대와 무관하게 재현한다. */
    static LocalDateTime toServerTime(String text, ZoneId serverZone) {
        if (text.endsWith("Z") || text.endsWith("z") || text.matches(".*[+-]\\d{2}:\\d{2}$")) {
            return OffsetDateTime.parse(text).atZoneSameInstant(serverZone).toLocalDateTime();
        }
        return LocalDateTime.parse(text).atZone(KstClock.ZONE).withZoneSameInstant(serverZone).toLocalDateTime();
    }
}
