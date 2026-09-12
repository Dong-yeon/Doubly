package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * 음식 이름 → 식품영양정보 조회 — 공공데이터포털
 * <b>식품의약품안전처_식품영양성분DB정보</b>({@code apis.data.go.kr/1471000/FoodNtrCpntDbInfo02}).
 *
 * <p><b>왜 식품안전나라가 아닌가.</b> 원래는 식품안전나라 OpenAPI 의 {@code I2790} 을 불렀는데
 * 그 서비스는 <b>"식품영양성분DB(~2023)"</b> 로 종료됐다 — 아무 키로 불러도 {@code ERROR-310}
 * ("해당하는 서비스를 찾을 수 없습니다")이 돌아온다. 후속이 이 포털 API 이고, 인증키 방식도
 * <b>경로 세그먼트 → 쿼리 파라미터</b>로 바뀌었다(경위: {@code docs/DIET_FOOD_SEARCH_2026-09-12.md}).
 *
 * <p><b>영양소 필드({@code AMT_NUM*})는 실제 응답과 참고문서로 대조했다</b>(2026-09-12).
 * 옛 {@code NUTR_CONT} 순서와 <b>다르다</b> — 거기선 2=탄수화물·3=단백질이었지만 여기는
 * 3=단백질·6=탄수화물이다. 그대로 옮기면 탄단이 뒤바뀐다.
 *
 * <p><b>기준량이 1회 제공량이 아니다.</b> {@code SERVING_SIZE} 는 "영양성분함량기준량"(보통
 * {@code 100g})이다. 그래서 값을 그대로 채울 때 {@code servingSize} 를 함께 노출해야 한다 —
 * 안 그러면 "공기밥 137kcal"처럼 기준량이 빠진 숫자가 1인분으로 읽힌다. 1인분 환산이 필요하면
 * {@code NUTRI_AMOUNT_SERVING}(1회 섭취참고량)·{@code DISH_ONE_SERVING}(1회분량 참고량)이 있다.
 *
 * <p><b>바코드 조회는 이 API 로 할 수 없다</b> — 새 데이터셋에 바코드 필드가 없다(옛 {@code I2790}
 * 에는 {@code BAR_CD} 가 있었다). {@link #lookup} 이 그 사실을 명시적으로 알린다.
 *
 * @see FoodDbProperties
 */
@Component
public class FoodDbClient {

    private static final Logger log = LoggerFactory.getLogger(FoodDbClient.class);

    /** 상세기능(오퍼레이션) 이름 — 엔드포인트 뒤에 붙는다 */
    private static final String OPERATION = "getFoodNtrCpntDbInq02";

    /** 정상 처리 — 포털 표준 응답의 {@code header.resultCode} */
    private static final String CODE_SUCCESS = "00";

    /** 이름 검색 결과 상한 — 호출부가 골라야 하니 너무 길지 않게 */
    private static final int SEARCH_LIMIT = 10;

    private final FoodDbProperties properties;
    private final RestClient restClient;

    public FoodDbClient(FoodDbProperties properties) {
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
     * 바코드 조회 — <b>지원하지 않는다.</b>
     *
     * <p>현재 데이터셋에는 바코드 필드가 없다. 살리려면 별도 API(식품안전나라 {@code I2570}
     * 유통바코드 등)로 바코드 → 제품명을 얻어 {@link #search} 로 넘기는 2단 구조가 필요하고,
     * 그 API 는 인증키 체계가 또 다르다. 그때까지는 "준비되지 않았다"고 정확히 말한다 —
     * 예전처럼 조회 실패를 "등록되지 않은 바코드"로 번역하지 않는다.
     */
    public BarcodeLookupResponse lookup(String barcode) {
        log.debug("바코드 조회 요청({})이 들어왔으나 현재 데이터셋에 바코드 필드가 없다", barcode);
        throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
    }

    /**
     * 음식 이름으로 검색 — 못 찾으면 빈 목록을 돌려준다(에러 아님).
     * 호출부가 결과를 골라야 하므로 여러 건을 그대로 넘긴다({@link #SEARCH_LIMIT}건까지).
     */
    public List<BarcodeLookupResponse> search(String keyword) {
        if (!isConfigured()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
        }
        String trimmed = keyword == null ? "" : keyword.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }

        JsonNode items = fetchItems(trimmed);
        if (!items.isArray() || items.isEmpty()) {
            return List.of();
        }
        List<BarcodeLookupResponse> results = new ArrayList<>();
        for (JsonNode item : items) {
            results.add(map(item));
        }
        return results;
    }

    private JsonNode fetchItems(String keyword) {
        String url = "%s/%s?serviceKey=%s&type=json&pageNo=1&numOfRows=%d&FOOD_NM_KR=%s".formatted(
                trimTrailingSlash(properties.getBaseUrl()),
                OPERATION,
                encodedServiceKey(),
                SEARCH_LIMIT,
                URLEncoder.encode(keyword, StandardCharsets.UTF_8));

        JsonNode root;
        try {
            /*
             * URI 로 넘긴다 — 문자열 uri(String) 는 이미 퍼센트 인코딩된 인증키를 한 번 더
             * 인코딩해(%2F → %252F) 키를 깨뜨린다.
             */
            root = restClient.get().uri(URI.create(url)).retrieve().body(JsonNode.class);
        } catch (RestClientException e) {
            // 키를 가린 URL 을 함께 남긴다 — 서비스 없음·키 오류·형식 변경을 로그만으로 가리기 위해
            log.warn("식품 DB 조회 실패: {} — 요청 {}", e.getMessage(), maskKey(url));
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        if (root == null) {
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        return extractItems(root, maskKey(url));
    }

    /**
     * 응답에서 항목을 꺼내되 <b>{@code header.resultCode} 를 먼저 본다.</b>
     *
     * <p>포털 API 는 오류도 HTTP 200 으로 돌려준다. 코드를 보지 않고 {@code body.items} 만 꺼내면
     * "인증키 미등록"·"서비스 없음"이 모두 <b>데이터 없음</b>으로 번역돼, 사용자에게는 그냥
     * "DB 에 없는 음식"으로 보이고 로그에는 아무것도 남지 않는다 — 식품 DB 가 통째로 죽어 있던 걸
     * 늦게 알아챈 이유가 정확히 이것이다(2026-09-12).
     *
     * <p>package-private — HTTP 없이 이 분기만 단위 테스트하기 위해.
     */
    JsonNode extractItems(JsonNode root, String requestForLog) {
        String code = root.path("header").path("resultCode").asText("");
        if (!code.isBlank() && !CODE_SUCCESS.equals(code)) {
            log.warn("식품 DB 가 오류를 돌려줬다 resultCode={} msg={} — 요청 {}",
                    code, root.path("header").path("resultMsg").asText(""), requestForLog);
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        return root.path("body").path("items");
    }

    /**
     * 인증키를 쿼리에 넣을 형태로.
     *
     * <p>포털은 <b>Encoding/Decoding 두 형태</b>를 준다. Encoding 키는 이미 {@code %2F} 처럼
     * 퍼센트 인코딩돼 있어 그대로 넣어야 하고, Decoding 키({@code /}·{@code +} 원본)는 우리가
     * 인코딩해야 한다 — {@code +} 를 그냥 넣으면 서버가 공백으로 읽어 키가 틀어진다.
     * 어느 쪽을 설정해도 동작하게 모양을 보고 가른다.
     */
    private String encodedServiceKey() {
        String key = properties.getApiKey().trim();
        return looksPercentEncoded(key) ? key : URLEncoder.encode(key, StandardCharsets.UTF_8);
    }

    /** 이미 퍼센트 인코딩된 키인가 — {@code %} + 16진수 두 자리가 있으면 그렇게 본다. */
    static boolean looksPercentEncoded(String key) {
        return key != null && key.matches(".*%[0-9A-Fa-f]{2}.*");
    }

    /** 로그용 — 쿼리에 박힌 인증키를 가린다. */
    private String maskKey(String url) {
        String key = properties.getApiKey();
        if (key == null || key.isBlank()) return url;
        return url.replace(encodedServiceKey(), "<KEY>").replace(key, "<KEY>");
    }

    private String trimTrailingSlash(String base) {
        return base != null && base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    /**
     * 항목 하나 → 우리 DTO. 필드명은 참고문서(출력메세지_식품영양성분DB정보.xlsx)와 실제 응답으로
     * 대조했다. 바코드 자리는 이 데이터셋에 없어 빈 문자열이다.
     *
     * <p>package-private — HTTP 없이 매핑만 단위 테스트하기 위해.
     */
    BarcodeLookupResponse map(JsonNode item) {
        return new BarcodeLookupResponse(
                "",                                     // 바코드 — 이 데이터셋에 없다
                textOrNull(item, "FOOD_NM_KR"),         // 식품명
                textOrNull(item, "SERVING_SIZE"),       // 영양성분함량기준량 (보통 100g)
                intOrNull(item, "AMT_NUM1"),            // 에너지(kcal)
                intOrNull(item, "AMT_NUM6"),            // 탄수화물(g)
                intOrNull(item, "AMT_NUM3"),            // 단백질(g)
                intOrNull(item, "AMT_NUM4"),            // 지방(g)
                intOrNull(item, "AMT_NUM7"),            // 당류(g)
                intOrNull(item, "AMT_NUM13"),           // 나트륨(mg)
                intOrNull(item, "AMT_NUM8")             // 식이섬유(g)
        );
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode v = row.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String text = v.asText(null);
        return text == null || text.isBlank() ? null : text;
    }

    /**
     * 응답 숫자는 문자열로 온다({@code "137.000"}). 값이 없는 항목은 <b>빈 문자열</b>이고,
     * 큰 값에는 천 단위 쉼표가 붙는다({@code "1,670.000"}) — 둘 다 여기서 흡수한다.
     */
    private Integer intOrNull(JsonNode row, String field) {
        JsonNode v = row.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        String text = v.asText().trim().replace(",", "");
        if (text.isEmpty()) return null;
        try {
            return (int) Math.round(Double.parseDouble(text));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
