package com.fitto.content.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.TmdbProperties;
import com.fitto.content.domain.ContentType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * TMDB(The Movie Database) 제목 검색 — 콘텐츠 등록의 "제목부터 찾기" 공급원.
 * {@link com.fitto.place.service.KakaoLocalClient} 와 완전히 같은 패턴(설정 없으면 빈 목록,
 * 실패해도 던지지 않음) — 영화·드라마 도메인 버전이다.
 *
 * <p><b>공연(PERFORMANCE)은 대상이 아니다.</b> TMDB 는 영화·TV(드라마)만 다룬다 — 공연은
 * 처음부터 합의한 대로(2026-08-24) 제목 직접 입력만 지원한다.
 *
 * <p>/search/multi 는 movie/tv/person 이 섞여 나와 person 은 걸러낸다.
 */
@Component
public class TmdbClient {

    private static final Logger log = LoggerFactory.getLogger(TmdbClient.class);

    private static final String SEARCH_URL =
            "https://api.themoviedb.org/3/search/multi?query={query}&language=ko-KR&api_key={apiKey}";

    /** 포스터 이미지 베이스 — w342 는 목록 썸네일에 넉넉한 폭(원본은 w92~original 여러 단계) */
    private static final String POSTER_BASE = "https://image.tmdb.org/t/p/w342";

    private final TmdbProperties properties;
    private final RestClient restClient;

    public TmdbClient(TmdbProperties properties) {
        this.properties = properties;
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    /** 검색 결과 1건 — TMDB results[] 필드를 앱에서 쓰는 모양으로 추린 것 */
    public record TmdbResult(String title, ContentType type, String posterUrl, String year) {
    }

    public List<TmdbResult> search(String query, int size) {
        if (!properties.isConfigured() || query == null || query.isBlank()) {
            return List.of();
        }
        JsonNode root;
        try {
            root = restClient.get()
                    .uri(SEARCH_URL, query, properties.getApiKey())
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("TMDB 검색 실패 (query={}): {}", query, e.getMessage());
            return List.of();
        }
        List<TmdbResult> results = new ArrayList<>();
        if (root != null) {
            for (JsonNode item : root.path("results")) {
                TmdbResult r = mapResult(item);
                if (r != null) {
                    results.add(r);
                }
                if (results.size() >= size) {
                    break;
                }
            }
        }
        return results;
    }

    /** package-private — HTTP 없이 매핑 로직만 단위 테스트하기 위해 (KakaoLocalClient.mapDocument 와 같은 패턴) */
    TmdbResult mapResult(JsonNode item) {
        String mediaType = item.path("media_type").asText("");
        ContentType type = switch (mediaType) {
            case "movie" -> ContentType.MOVIE;
            case "tv" -> ContentType.DRAMA;
            default -> null; // person 등 — 콘텐츠가 아니라 걸러낸다
        };
        if (type == null) {
            return null;
        }
        // 영화는 title/release_date, TV(드라마)는 name/first_air_date 필드를 쓴다
        String title = type == ContentType.MOVIE
                ? item.path("title").asText("")
                : item.path("name").asText("");
        if (title.isBlank()) {
            return null;
        }
        String date = type == ContentType.MOVIE
                ? item.path("release_date").asText("")
                : item.path("first_air_date").asText("");
        String year = date.length() >= 4 ? date.substring(0, 4) : null;
        String posterPath = item.path("poster_path").asText(null);
        String posterUrl = posterPath != null && !posterPath.isBlank() ? POSTER_BASE + posterPath : null;
        return new TmdbResult(title, type, posterUrl, year);
    }
}
