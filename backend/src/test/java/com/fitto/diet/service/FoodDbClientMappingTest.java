package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

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

    @Test
    void 이름_검색_결과에_BAR_CD가_없으면_빈_문자열이_된다() throws Exception {
        JsonNode row = row("""
                { "DESC_KOR": "바코드 없는 음식" }
                """);

        BarcodeLookupResponse res = client.mapRow(row);

        assertThat(res.barcode()).isEqualTo("");
    }
}
