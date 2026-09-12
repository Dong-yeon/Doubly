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
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 바코드/이름 → 식품영양정보 조회 — 식품안전나라 OpenAPI 식품영양성분DB정보(서비스ID: I2790).
 *
 * <p>⚠️ <b>필드 매핑은 실제 응답으로 대조되지 않았다.</b> {@code NUTR_CONT1}~{@code 8} 순서는
 * 공개 문서 기준 최선의 추정치이고, 데이터셋 개정으로 순서가 바뀌었을 수 있다. 인증키는 운영에
 * 설정돼 있으므로(2026-09-12 확인) 남은 확인은 응답 키 대조뿐이다 — 어긋나면 예외가 아니라
 * "조회는 되는데 값이 전부 null" 로만 드러나므로 {@link #warnIfUnmapped} 가 실제 응답 키를
 * <b>WARN 으로</b> 한 번 남긴다({@code log.debug} 는 운영 로그 레벨에서 보이지 않는다).
 * 그 로그를 보고 {@link #map} 만 고치면 된다 — 호출부는 영향이 없다.
 *
 * <p>{@link #search}는 바코드 없이 음식 이름만 입력했을 때(예: "단백질쉐이크") AI 추정 대신
 * 공공 DB의 실제 표기값을 우선 찾게 해준다 — AI 텍스트 분석({@code AI_FOOD_TEXT})은 비용이 들고
 * 추정치인 반면, 이건 무료에 실제 값이라 매칭되면 더 낫다. 못 찾으면 빈 목록만 돌려주고(에러 아님)
 * 프론트가 기존 AI 계산으로 유도한다.
 *
 * @see FoodDbProperties
 */
@Component
public class FoodDbClient {

    private static final Logger log = LoggerFactory.getLogger(FoodDbClient.class);

    /** 식품영양성분DB정보 서비스 ID — 식품안전나라 OpenAPI 카탈로그 기준 */
    private static final String SERVICE_ID = "I2790";

    /** 이름 검색 결과 상한 — 프론트에서 사용자가 직접 골라야 하니 너무 길지 않게 */
    private static final int SEARCH_LIMIT = 10;

    private final FoodDbProperties properties;
    private final RestClient restClient;

    /**
     * 필드명 불일치 경고를 한 번만 남기기 위한 플래그 — 조회마다 같은 경고를 쌓을 이유가 없다.
     */
    private final AtomicBoolean fieldMismatchLogged = new AtomicBoolean(false);

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

    public BarcodeLookupResponse lookup(String barcode) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
        }

        String encodedBarcode = URLEncoder.encode(barcode, StandardCharsets.UTF_8);
        JsonNode rows = fetchRows("BAR_CD=" + encodedBarcode, 1, 5);
        if (!rows.isArray() || rows.isEmpty()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_FOUND);
        }

        JsonNode row = rows.get(0);
        log.debug("바코드 조회 원본 응답(필드 매핑 검증용): {}", row);
        return mapRow(barcode, row);
    }

    /**
     * 음식 이름으로 검색 — 정확히 일치하는 게 없으면 빈 목록을 돌려준다(에러 아님).
     * 사용자가 직접 결과를 골라야 하므로 여러 건을 그대로 넘긴다({@link #SEARCH_LIMIT}건까지).
     */
    public List<BarcodeLookupResponse> search(String keyword) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
        }
        String trimmed = keyword == null ? "" : keyword.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }

        String encodedKeyword = URLEncoder.encode(trimmed, StandardCharsets.UTF_8);
        JsonNode rows = fetchRows("DESC_KOR=" + encodedKeyword, 1, SEARCH_LIMIT);
        if (!rows.isArray() || rows.isEmpty()) {
            return List.of();
        }

        List<BarcodeLookupResponse> results = new ArrayList<>();
        for (JsonNode row : rows) {
            results.add(mapRow(row));
        }
        log.debug("이름 검색 결과 {}건(필드 매핑 검증용): {}", results.size(), rows);
        return results;
    }

    /** {baseUrl}/{키}/I2790/json/{시작행}/{종료행}/{필터} 호출 공통 처리 */
    private JsonNode fetchRows(String filter, int startRow, int endRow) {
        String url = "%s/%s/%s/json/%d/%d/%s"
                .formatted(properties.getBaseUrl(), properties.getApiKey(), SERVICE_ID, startRow, endRow, filter);

        JsonNode root;
        try {
            root = restClient.get().uri(url).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("식품 DB 조회 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        if (root == null) {
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        return root.path(SERVICE_ID).path("row");
    }

    /**
     * 이름 검색용 — 바코드를 모르니 행 안의 {@code BAR_CD} 필드에서 뽑는다(없으면 빈 문자열).
     * ⚠️ {@code BAR_CD} 필드명도 {@code NUTR_CONT1}~{@code 8} 과 마찬가지로 실제 키로 검증되지 않았다.
     */
    BarcodeLookupResponse mapRow(JsonNode row) {
        String barcode = textOrNull(row, "BAR_CD");
        return mapRow(barcode != null ? barcode : "", row);
    }

    /**
     * 매핑 + 불일치 진단. package-private — HTTP 없이 매핑 로직만 단위 테스트하기 위해.
     * 필드명을 고칠 자리는 {@link #map} 이다.
     */
    BarcodeLookupResponse mapRow(String barcode, JsonNode row) {
        BarcodeLookupResponse mapped = map(barcode, row);
        warnIfUnmapped(row, mapped);
        return mapped;
    }

    private BarcodeLookupResponse map(String barcode, JsonNode row) {
        return new BarcodeLookupResponse(
                barcode,
                textOrNull(row, "DESC_KOR"),
                textOrNull(row, "SERVING_SIZE"),
                intOrNull(row, "NUTR_CONT1"),  // 열량(kcal)
                intOrNull(row, "NUTR_CONT2"),  // 탄수화물(g)
                intOrNull(row, "NUTR_CONT3"),  // 단백질(g)
                intOrNull(row, "NUTR_CONT4"),  // 지방(g)
                intOrNull(row, "NUTR_CONT5"),  // 당류(g)
                intOrNull(row, "NUTR_CONT6"),  // 나트륨(mg)
                intOrNull(row, "NUTR_CONT8")   // 식이섬유(g) — 데이터셋에 없으면 항상 null
        );
    }

    /**
     * 매핑 결과가 비면 응답의 <b>실제 키</b>를 한 번 남긴다.
     *
     * <p>위 경고대로 {@code DESC_KOR}·{@code NUTR_CONT1}~{@code 8}·{@code BAR_CD} 는 문서 기준
     * 추정치다. 데이터셋 개정으로 이름이 바뀌면 예외가 아니라 <b>"조회는 되는데 값이 전부 null"</b>
     * 로만 드러나는데, 그때 단서가 되던 {@code log.debug} 는 운영(INFO)에서 보이지 않는다.
     * 그래서 이 경고가 매핑을 보정할 유일한 실마리다 — 로그에 찍힌 키에 맞춰 {@link #map} 만 고치면 된다.
     */
    private void warnIfUnmapped(JsonNode row, BarcodeLookupResponse mapped) {
        if (mapped.foodName() != null && mapped.calories() != null) return;
        if (!fieldMismatchLogged.compareAndSet(false, true)) return;
        List<String> keys = new ArrayList<>();
        row.fieldNames().forEachRemaining(keys::add);
        log.warn("식품 DB 응답 필드가 예상과 다르다 — 매핑 결과 name={} kcal={}, 실제 응답 키={}"
                + " (FoodDbClient.map 을 이 키에 맞춰 보정할 것)", mapped.foodName(), mapped.calories(), keys);
    }

    private String textOrNull(JsonNode row, String field) {
        JsonNode v = row.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText(null);
    }

    /** 응답 필드가 문자열 숫자("123.4")로 오는 경우가 많아 반올림해 정수로 통일한다. */
    private Integer intOrNull(JsonNode row, String field) {
        JsonNode v = row.path(field);
        if (v.isMissingNode() || v.isNull()) return null;
        try {
            return (int) Math.round(Double.parseDouble(v.asText().trim()));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
