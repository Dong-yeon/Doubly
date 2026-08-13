package com.fitto.common.config;

import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * {@link LocalDateTime} 필드의 JSON 직렬화 규약을 앱 전체에서 통일한다.
 *
 * <p><b>배경</b>: 서버 JVM은 (컨테이너 기본값에 의해) UTC로 동작하고, {@code @CreatedDate}
 * 등이 채우는 {@link LocalDateTime}은 사실상 <b>UTC 벽시계 시각</b>이다 — 단지 그 사실이
 * 타입에 드러나지 않을 뿐이다({@link com.fitto.feed.dto.FeedCursor}가 커서를 인코딩할 때도
 * 동일하게 {@link ZoneOffset#UTC} 기준으로 다루는 것과 같은 전제).
 *
 * <p>문제는 Jackson 기본 직렬화가 오프셋 없는 문자열({@code "2026-08-12T23:51:23"})을 내보낸다는
 * 점이다. 이걸 받은 프론트엔드(JS)의 {@code new Date(iso)}는 오프셋이 없는 문자열을
 * <b>"기기 로컬시간"</b>으로 해석하므로, UTC 시각이 변환 없이 그대로 화면에 찍힌다
 * (KST 08:51 전송 → 서버 UTC 23:51 저장 → 프론트가 그 "23:51"을 그대로 로컬시간처럼 표시).
 *
 * <p>그래서 여기서 {@code Z} 오프셋을 명시적으로 붙여 내보낸다. 그러면 클라이언트의
 * {@code new Date(iso)}가 UTC 인스턴트로 정확히 파싱하고, 각 기기가 자기 로컬(KST 등)로
 * 올바르게 변환해서 보여준다 — 프론트엔드 수정 없이 이 설정만으로 모든 화면
 * (채팅, 피드, 운동 기록 등)의 시간 표시가 함께 바로잡힌다.
 */
@Configuration
public class JacksonConfig {

    /** 서버가 저장·계산에 쓰는 {@link LocalDateTime}은 항상 UTC 벽시계 시각이라는 전제. */
    private static final ZoneOffset SERVER_OFFSET = ZoneOffset.UTC;

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer utcLocalDateTimeCustomizer() {
        return builder -> {
            SimpleModule module = new SimpleModule();
            // 직렬화: LocalDateTime -> "...Z" (UTC 인스턴트로 명시)
            module.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(
                    DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSSSS'Z'")));
            // 역직렬화: 오프셋 있는 문자열("...Z", "...+09:00")도, 기존처럼 오프셋 없는
            // 문자열도 모두 받아 "UTC 기준 LocalDateTime"으로 정규화한다 (하위 호환).
            module.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(
                    DateTimeFormatter.ISO_LOCAL_DATE_TIME) {
                @Override
                public LocalDateTime deserialize(com.fasterxml.jackson.core.JsonParser p,
                                                   com.fasterxml.jackson.databind.DeserializationContext ctxt)
                        throws java.io.IOException {
                    String text = p.getText();
                    if (text != null && !text.isBlank()
                            && (text.endsWith("Z") || text.matches(".*[+-]\\d{2}:\\d{2}$"))) {
                        return OffsetDateTime.parse(text).withOffsetSameInstant(SERVER_OFFSET).toLocalDateTime();
                    }
                    return super.deserialize(p, ctxt);
                }
            });
            builder.modulesToInstall(modules -> modules.add(module));
        };
    }
}
