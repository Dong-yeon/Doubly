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

/**
 * 바코드 → 식품영양정보 조회 — 식품안전나라 OpenAPI 식품영양성분DB정보(서비스ID: I2790).
 *
 * <p>⚠️ <b>필드 매핑은 실제 인증키 발급 전 검증되지 않았다.</b> {@code NUTR_CONT1}~{@code 8} 순서는
 * 공개 문서 기준 최선의 추정치이고, 데이터셋 개정으로 순서가 바뀌었을 수 있다. 실제 키를 붙인 뒤
 * {@link #lookup} 이 남기는 {@code log.debug} 원본 응답으로 대조해 {@link #mapRow} 를 보정할 것.
 * (AI 분석과 달리 이 API 는 무료 회원가입만으로 즉시 키 발급 — 미설정 시엔 기능만 조용히 비활성.)
 *
 * @see FoodDbProperties
 */
@Component
public class FoodDbClient {

    private static final Logger log = LoggerFactory.getLogger(FoodDbClient.class);

    /** 식품영양성분DB정보 서비스 ID — 식품안전나라 OpenAPI 카탈로그 기준 */
    private static final String SERVICE_ID = "I2790";

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

    public BarcodeLookupResponse lookup(String barcode) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_CONFIGURED);
        }

        String encodedBarcode = URLEncoder.encode(barcode, StandardCharsets.UTF_8);
        // {baseUrl}/{키}/I2790/json/{시작행}/{종료행}/BAR_CD={바코드}
        String url = "%s/%s/%s/json/1/5/BAR_CD=%s"
                .formatted(properties.getBaseUrl(), properties.getApiKey(), SERVICE_ID, encodedBarcode);

        JsonNode root;
        try {
            root = restClient.get().uri(url).retrieve().body(JsonNode.class);
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("바코드 조회 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        if (root == null) {
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }

        JsonNode envelope = root.path(SERVICE_ID);
        JsonNode rows = envelope.path("row");
        if (!rows.isArray() || rows.isEmpty()) {
            throw new BusinessException(ErrorCode.FOOD_DB_NOT_FOUND);
        }

        JsonNode row = rows.get(0);
        log.debug("바코드 조회 원본 응답(필드 매핑 검증용): {}", row);
        return mapRow(barcode, row);
    }

    /**
     * ⚠️ 검증 필요 — {@code NUTR_CONT1}~{@code 8} 필드명은 문서 기준 추정치다.
     * 실제 응답에서 어긋나면 이 메서드만 고치면 된다(호출부는 영향 없음).
     * package-private — HTTP 없이 매핑 로직만 단위 테스트하기 위해.
     */
    BarcodeLookupResponse mapRow(String barcode, JsonNode row) {
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
