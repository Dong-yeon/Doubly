package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * TMDB(The Movie Database) API 설정 바인딩 — application.yml 의 fitto.tmdb.*
 *
 * <p>영화·드라마 제목 검색용. themoviedb.org 에서 무료로 발급받는 v3 API 키다.
 * 비어 있으면 콘텐츠 검색만 비활성 — {@link com.fitto.content.service.TmdbClient} 참고.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.tmdb")
public class TmdbProperties {

    /** TMDB v3 API 키. 비어 있으면 콘텐츠 검색 비활성. */
    private String apiKey = "";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
