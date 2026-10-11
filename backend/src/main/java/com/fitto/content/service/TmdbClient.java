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
import java.util.concurrent.atomic.AtomicReference;

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

    /**
     * 지금 한국에서 상영 중인 영화 — AI 데이트 코스 "영화·공연"이 상영작만 후보로 두려고 쓴다(2026-10-07).
     * region=KR 이라 한국 개봉 일정 기준이다. 콘텐츠에 TMDB id 가 없어 <b>제목으로</b> 대조한다(한계는
     * docs/LOVELICHELIN_AI_COURSE_2026-10-07.md §4).
     */
    private static final String NOW_PLAYING_URL =
            "https://api.themoviedb.org/3/movie/now_playing?language=ko-KR&region=KR&page={page}&api_key={apiKey}";
    /** 상영작 목록은 하루에도 거의 안 바뀐다 — 코스 요청마다 TMDB 를 부르지 않게 잠깐 들고 있는다 */
    private static final Duration NOW_PLAYING_TTL = Duration.ofHours(3);
    /** 두 쪽(40편)이면 한국 상영작을 거의 다 덮는다 */
    private static final int NOW_PLAYING_PAGES = 2;

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

    /** 상영작 한 편 — 한국어 제목과 원제(둘 다로 대조한다) */
    public record NowPlaying(String title, String originalTitle) {
    }

    private record Cached(java.time.Instant at, List<NowPlaying> movies) {
    }

    private final AtomicReference<Cached> nowPlayingCache = new AtomicReference<>();

    /**
     * 지금 상영 중인 영화. 설정이 없거나 실패하면 빈 목록 — 호출부(코스)는 "상영 여부를 모르니 영화는 후보에서 뺀다"로 읽는다.
     * 실패는 캐시하지 않는다(다음 요청이 다시 시도한다).
     */
    public List<NowPlaying> nowPlaying() {
        if (!properties.isConfigured()) {
            return List.of();
        }
        Cached cached = nowPlayingCache.get();
        if (cached != null && cached.at().plus(NOW_PLAYING_TTL).isAfter(java.time.Instant.now())) {
            return cached.movies();
        }
        List<NowPlaying> movies = new ArrayList<>();
        for (int page = 1; page <= NOW_PLAYING_PAGES; page++) {
            JsonNode root;
            try {
                root = restClient.get()
                        .uri(NOW_PLAYING_URL, page, properties.getApiKey())
                        .retrieve()
                        .body(JsonNode.class);
            } catch (RestClientResponseException | ResourceAccessException e) {
                log.warn("TMDB 상영작 조회 실패 (page={}): {}", page, e.getMessage());
                return movies.isEmpty() ? List.of() : List.copyOf(movies);
            }
            if (root == null) break;
            movies.addAll(mapNowPlaying(root));
            if (page >= root.path("total_pages").asInt(1)) break;
        }
        List<NowPlaying> result = List.copyOf(movies);
        nowPlayingCache.set(new Cached(java.time.Instant.now(), result));
        return result;
    }

    /** package-private — HTTP 없이 매핑만 테스트한다 */
    List<NowPlaying> mapNowPlaying(JsonNode root) {
        List<NowPlaying> movies = new ArrayList<>();
        for (JsonNode item : root.path("results")) {
            String title = item.path("title").asText("");
            String original = item.path("original_title").asText("");
            if (title.isBlank() && original.isBlank()) continue;
            movies.add(new NowPlaying(title, original));
        }
        return movies;
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
