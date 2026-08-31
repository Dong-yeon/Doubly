package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.KakaoLocalProperties;
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
import java.util.Map;

/**
 * 카카오 로컬 키워드 검색 — AI 맛집 추천의 "실존 장소" 공급원.
 *
 * <p>LLM 에게 가게 이름을 직접 물으면 폐업했거나 존재하지 않는 곳을 지어내므로
 * ({@link DateCourseService} 가 "목록에 없는 장소는 만들지 않습니다"로 방어하는 것과 같은 이유),
 * 추천 파이프라인은 Gemini 가 <b>검색어</b>만 만들고 실제 장소는 여기서 조회한다.
 *
 * <p>검색 1건의 실패가 추천 전체를 죽이지 않도록 실패 시 던지지 않고 빈 목록을 돌려준다 —
 * 검색어 2~3개 중 하나만 성공해도 추천은 성립한다.
 */
@Component
public class KakaoLocalClient {

    private static final Logger log = LoggerFactory.getLogger(KakaoLocalClient.class);

    private static final String SEARCH_URL =
            "https://dapi.kakao.com/v2/local/search/keyword.json?query={query}&size={size}";

    private final KakaoLocalProperties properties;
    private final RestClient restClient;

    public KakaoLocalClient(KakaoLocalProperties properties) {
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

    /**
     * 키워드 검색 결과 1건 — 카카오 문서(documents[]) 필드를 앱에서 쓰는 모양으로 추린 것.
     * {@code id} 는 카카오가 매기는 장소 고유 id — 같은 장소를 다시 저장하려 할 때
     * PlaceService.save() 가 이 값으로 중복 등록을 막는 데 쓴다.
     */
    public record KakaoPlace(String id, String name, String address, String category,
                             Double lat, Double lng, String placeUrl) {
    }

    public List<KakaoPlace> searchKeyword(String query, int size) {
        if (!properties.isConfigured() || query == null || query.isBlank()) {
            return List.of();
        }
        JsonNode root;
        try {
            root = restClient.get()
                    .uri(SEARCH_URL, query, size)
                    .header("Authorization", "KakaoAK " + properties.getRestApiKey())
                    .retrieve()
                    .body(JsonNode.class);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("카카오 로컬 검색 실패 (query={}): {}", query, e.getMessage());
            return List.of();
        }
        List<KakaoPlace> results = new ArrayList<>();
        if (root != null) {
            for (JsonNode doc : root.path("documents")) {
                KakaoPlace place = mapDocument(doc);
                if (place != null) {
                    results.add(place);
                }
            }
        }
        return results;
    }

    /** package-private — HTTP 없이 매핑 로직만 단위 테스트하기 위해 (FoodDbClient.mapRow 와 같은 패턴) */
    KakaoPlace mapDocument(JsonNode doc) {
        String name = doc.path("place_name").asText("");
        if (name.isBlank()) {
            return null;
        }
        String address = firstNonBlank(doc.path("road_address_name").asText(""),
                doc.path("address_name").asText(""));
        return new KakaoPlace(
                doc.path("id").asText(null),
                name,
                address,
                mapCategory(doc.path("category_group_code").asText(null), doc.path("category_name").asText("")),
                parseCoord(doc.path("y").asText(null)),  // 카카오는 y=위도, x=경도
                parseCoord(doc.path("x").asText(null)),
                doc.path("place_url").asText(null));
    }

    /**
     * 카카오 category_group_code → 앱 카테고리. 프론트 constants/placeCategories.ts 의
     * KAKAO_CATEGORY_AUTO(지도 SDK 검색용)와 반드시 같은 값을 써야 한다 — 둘 다
     * PLACE_CATEGORIES(7개, docs/LOVELICHELIN_IA_SIMPLIFICATION.md) 밖의 값을 내보내면
     * 그 장소가 목록의 특정 카테고리 칩에서 안 보이고 "전체"에만 뜬다(2026-08-31에
     * 실제로 이 매핑이 없어서 생긴 문제 — 텍스트(category_name)로 대충 추측하던 예전
     * 방식은 카카오의 2차 분류 문구가 그대로 나와 7개 중 어디에도 안 맞을 수 있었다).
     */
    private static final Map<String, String> GROUP_CODE_TO_CATEGORY = Map.of(
            "FD6", "음식점",
            "CE7", "카페·디저트",
            "AT4", "여행지",
            "CT1", "박물관·전시",
            "AD5", "숙소");

    /**
     * group code 가 5개 매핑 밖이거나 없으면(옛 응답, 지원 안 하는 장소 유형 등) 억지로
     * 7개 카테고리에 끼워맞추지 않고 비워둔다 — 목록엔 "전체"로는 그대로 보이고, 나중에
     * 장소 수정 화면에서 사람이 직접 고를 수 있다. 딱 하나 예외: "음식점 > 한식 > 국수"
     * 처럼 최상위 텍스트가 "음식점"이면 group code 없이도 신뢰할 수 있는 유일한 케이스라
     * 그대로 살린다.
     */
    private static String mapCategory(String categoryGroupCode, String categoryName) {
        String byGroup = categoryGroupCode == null ? null : GROUP_CODE_TO_CATEGORY.get(categoryGroupCode);
        if (byGroup != null) {
            return byGroup;
        }
        if (categoryName.isBlank()) {
            return null;
        }
        String top = categoryName.split(">")[0].trim();
        return top.equals("음식점") ? "음식점" : null;
    }

    private static String firstNonBlank(String a, String b) {
        if (!a.isBlank()) return a;
        return b.isBlank() ? null : b;
    }

    private static Double parseCoord(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
