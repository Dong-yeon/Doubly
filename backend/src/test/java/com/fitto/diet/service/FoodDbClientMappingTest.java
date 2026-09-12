package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 바코드 조회 응답 매핑 — HTTP 없는 순수 단위 테스트. {@code NUTR_CONT1}~{@code 8} 의 정확한
 * 필드명은 실제 인증키로 검증되지 않았으므로(FoodDbClient 상단 주석 참고), 여기서는 그 이름들이
 * "왔을 때" null-safety·숫자 파싱이 안전한지만 검증한다 — 실제 필드명 자체는 검증 대상이 아니다.
 */
class FoodDbClientMappingTest {

    private final FoodDbClient client = new FoodDbClient(new FoodDbProperties());
    private final ObjectMapper objectMapper = new ObjectMapper();

    private JsonNode row(String json) throws Exception {
        return objectMapper.readTree(json);
    }

    /**
     * 인증키가 경로 세그먼트에 들어가므로, {@code /} 를 품은 키(공공데이터포털 base64 서비스키)는
     * 원본이든 {@code %2F} 인코딩이든 쓸 수 없다 — 부팅 경고가 이 판정을 쓴다.
     */
    @Test
    void 경로에_넣을_수_없는_키_모양을_알아낸다() {
        assertThat(FoodDbClient.looksPathIncompatible("JL9aMaP/1Grqpl0VTVhfvEmoNrGW49U9bfcx==")).isTrue();
        assertThat(FoodDbClient.looksPathIncompatible("JL9aMaP%2F1Grqpl0VTVhfvEmoNrGW49U9%3D%3D")).isTrue();
        assertThat(FoodDbClient.looksPathIncompatible("abcdef0123456789abcdef0123456789abcdef01")).isFalse();
        assertThat(FoodDbClient.looksPathIncompatible(null)).isFalse();
    }

    /**
     * 이 API 는 오류도 HTTP 200 + {@code RESULT.CODE} 로 준다. 코드를 안 보면 "서비스 없음"이
     * "데이터 없음"으로 번역돼 조용히 묻힌다 — 2026-09-12 에 실제로 그렇게 묻혀 있었다.
     */
    @Test
    void 서비스_없음_오류를_데이터_없음으로_넘기지_않는다() throws Exception {
        JsonNode root = row("""
                {"I2790":{"total_count":"","RESULT":{"MSG":"해당하는 서비스를 찾을 수 없습니다.","CODE":"ERROR-310"}}}
                """);

        assertThatThrownBy(() -> client.extractRows(root, "http://example/api/<KEY>/I2790/json/1/1"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_LOOKUP_FAILED);
    }

    @Test
    void 데이터_없음은_오류가_아니라_빈_행이다() throws Exception {
        JsonNode root = row("""
                {"I2790":{"RESULT":{"MSG":"해당하는 데이터가 없습니다.","CODE":"INFO-200"}}}
                """);

        assertThat(client.extractRows(root, "req").isArray()).isFalse();
    }

    @Test
    void 정상_코드면_행을_그대로_돌려준다() throws Exception {
        JsonNode root = row("""
                {"I2790":{"RESULT":{"CODE":"INFO-000"},"row":[{"DESC_KOR":"밥"}]}}
                """);

        JsonNode rows = client.extractRows(root, "req");

        assertThat(rows.isArray()).isTrue();
        assertThat(rows.get(0).path("DESC_KOR").asText()).isEqualTo("밥");
    }

    @Test
    void 정상_응답을_매핑한다() throws Exception {
        JsonNode row = row("""
                {
                  "DESC_KOR": "테스트 그릭요거트",
                  "SERVING_SIZE": "1개(120g)",
                  "NUTR_CONT1": "150.0",
                  "NUTR_CONT2": "10.5",
                  "NUTR_CONT3": "12",
                  "NUTR_CONT4": "5",
                  "NUTR_CONT5": "8",
                  "NUTR_CONT6": "60"
                }
                """);

        BarcodeLookupResponse res = client.mapRow("8801234567890", row);

        assertThat(res.barcode()).isEqualTo("8801234567890");
        assertThat(res.foodName()).isEqualTo("테스트 그릭요거트");
        assertThat(res.servingSize()).isEqualTo("1개(120g)");
        assertThat(res.calories()).isEqualTo(150);
        assertThat(res.carbs()).isEqualTo(11); // 10.5 반올림
        assertThat(res.protein()).isEqualTo(12);
        assertThat(res.fat()).isEqualTo(5);
        assertThat(res.sugar()).isEqualTo(8);
        assertThat(res.sodium()).isEqualTo(60);
    }

    @Test
    void 필드가_없으면_null로_채운다() throws Exception {
        JsonNode row = row("""
                { "DESC_KOR": "정보 부족 식품" }
                """);

        BarcodeLookupResponse res = client.mapRow("111", row);

        assertThat(res.foodName()).isEqualTo("정보 부족 식품");
        assertThat(res.calories()).isNull();
        assertThat(res.fiber()).isNull();
    }

    @Test
    void 숫자로_파싱할_수_없는_값은_예외_없이_null이_된다() throws Exception {
        JsonNode row = row("""
                { "DESC_KOR": "이상값 식품", "NUTR_CONT1": "정보없음" }
                """);

        BarcodeLookupResponse res = client.mapRow("222", row);

        assertThat(res.calories()).isNull();
    }

    @Test
    void 이름_검색_결과는_행의_BAR_CD로_바코드를_채운다() throws Exception {
        JsonNode row = row("""
                { "DESC_KOR": "단백질쉐이크 초코맛", "BAR_CD": "8801234500000", "NUTR_CONT1": "180" }
                """);

        BarcodeLookupResponse res = client.mapRow(row);

        assertThat(res.barcode()).isEqualTo("8801234500000");
        assertThat(res.foodName()).isEqualTo("단백질쉐이크 초코맛");
        assertThat(res.calories()).isEqualTo(180);
    }

    /**
     * 필드명이 전부 어긋난 응답 — 예외 없이 null 로 떨어지고, 그때 {@code warnIfUnmapped} 가
     * 실제 키를 WARN 으로 남긴다. 이 경로가 깨지면 매핑 불일치를 알아낼 방법이 없어진다.
     */
    @Test
    void 필드명이_전부_다른_응답도_예외없이_빈_결과가_된다() throws Exception {
        JsonNode row = row("""
                { "FOOD_NM_KR": "개정된 데이터셋", "AMT_NUM1": "150" }
                """);

        BarcodeLookupResponse res = client.mapRow("333", row);

        assertThat(res.foodName()).isNull();
        assertThat(res.calories()).isNull();
        assertThat(res.barcode()).isEqualTo("333");
    }

    @Test
    void 이름_검색_결과에_BAR_CD가_없으면_빈_문자열이_된다() throws Exception {
        JsonNode row = row("""
                { "DESC_KOR": "바코드 없는 음식" }
                """);

        BarcodeLookupResponse res = client.mapRow(row);

        assertThat(res.barcode()).isEqualTo("");
    }
}
