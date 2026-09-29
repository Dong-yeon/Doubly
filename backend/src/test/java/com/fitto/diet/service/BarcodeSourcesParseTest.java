package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 바코드 출처별 응답 해석 — HTTP 없는 순수 단위 테스트.
 *
 * <p>식품안전나라 필드명은 공개 명세 기준(실응답 대조 전), Open Food Facts 는 v2 API 문서 기준이다.
 * 실응답으로 대조하면 이 픽스처를 실제 값으로 바꾼다(docs/BARCODE_LOOKUP_2026-09-29.md §5).
 */
class BarcodeSourcesParseTest {

    private final ObjectMapper om = new ObjectMapper();
    private final FoodSafetyBarcodeClient foodSafety = new FoodSafetyBarcodeClient(new FoodDbProperties());
    private final OpenFoodFactsClient off = new OpenFoodFactsClient(new FoodDbProperties());
    private final FoodDbClient foodDb = new FoodDbClient(new FoodDbProperties());

    private JsonNode json(String raw) throws Exception {
        return om.readTree(raw);
    }

    // ---- 식품안전나라 ----

    @Test
    void 유통바코드_응답에서_제품을_꺼낸다() throws Exception {
        JsonNode root = json("""
                {"I2570": {"total_count": "1",
                  "row": [{"BRCD_NO": "8801043014809", "PRDT_NM": "신라면", "CMPNY_NM": "(주)농심",
                           "PRDLST_REPORT_NO": "19780614001123"}],
                  "RESULT": {"MSG": "정상처리되었습니다.", "CODE": "INFO-000"}}}
                """);
        var p = foodSafety.parse(root, "I2570").orElseThrow();
        assertThat(p.name()).isEqualTo("신라면");
        assertThat(p.maker()).isEqualTo("(주)농심");
        assertThat(p.reportNo()).isEqualTo("19780614001123");
    }

    @Test
    void 바코드연계_응답의_다른_필드명도_읽는다() throws Exception {
        JsonNode root = json("""
                {"C005": {"row": [{"BAR_CD": "8801043014809", "PRDLST_NM": "신라면", "BSSH_NM": "농심"}],
                  "RESULT": {"CODE": "INFO-000"}}}
                """);
        var p = foodSafety.parse(root, "C005").orElseThrow();
        assertThat(p.name()).isEqualTo("신라면");
        assertThat(p.maker()).isEqualTo("농심");
        assertThat(p.reportNo()).isNull();
    }

    @Test
    void 데이터_없음과_키_오류는_비어_있음이다() throws Exception {
        assertThat(foodSafety.parse(json("""
                {"I2570": {"RESULT": {"MSG": "해당하는 데이터가 없습니다.", "CODE": "INFO-200"}}}
                """), "I2570")).isEmpty();
        assertThat(foodSafety.parse(json("""
                {"RESULT": {"MSG": "인증키가 유효하지 않습니다.", "CODE": "INFO-100"}}
                """), "I2570")).isEmpty();
    }

    // ---- Open Food Facts ----

    @Test
    void 일회_제공량_값이_있으면_그걸_쓰고_나트륨은_mg_로_바꾼다() throws Exception {
        JsonNode root = json("""
                {"status": 1, "product": {"product_name": "Protein Bar Cookies & Cream", "brands": "Quest,Quest Nutrition",
                  "serving_size": "1 bar (60 g)",
                  "nutriments": {"energy-kcal_100g": 333, "energy-kcal_serving": 200, "proteins_serving": 21,
                    "carbohydrates_serving": 22, "fat_serving": 8, "sugars_serving": 1.2,
                    "sodium_serving": 0.28, "fiber_serving": 14}}}
                """);
        BarcodeLookupResponse r = off.parse(root, "0888849000463").orElseThrow();
        assertThat(r.foodName()).isEqualTo("Quest Protein Bar Cookies & Cream");
        assertThat(r.servingSize()).isEqualTo("1 bar (60 g)");
        assertThat(r.calories()).isEqualTo(200);
        assertThat(r.protein()).isEqualTo(21);
        assertThat(r.sodium()).isEqualTo(280);
        assertThat(r.source()).isEqualTo(BarcodeLookupResponse.SOURCE_OPEN_FOOD_FACTS);
    }

    @Test
    void 일회_제공량이_없으면_100g_기준이고_kJ만_있으면_환산한다() throws Exception {
        JsonNode root = json("""
                {"status": 1, "product": {"product_name_ko": "제로 콜라",
                  "nutriments": {"energy_100g": "4.184", "carbohydrates_100g": "0"}}}
                """);
        BarcodeLookupResponse r = off.parse(root, "8801094013004").orElseThrow();
        assertThat(r.foodName()).isEqualTo("제로 콜라");
        assertThat(r.servingSize()).isEqualTo("100g");
        assertThat(r.calories()).isEqualTo(1);
        assertThat(r.carbs()).isZero();
    }

    @Test
    void 없는_제품이나_이름없는_제품은_비어_있음이다() throws Exception {
        assertThat(off.parse(json("{\"status\": 0}"), "1")).isEmpty();
        assertThat(off.parse(json("{\"status\": 1, \"product\": {\"nutriments\": {}}}"), "1")).isEmpty();
    }

    @Test
    void 영양이_없는_제품은_이름만_있는_결과다() throws Exception {
        BarcodeLookupResponse r = off.parse(json("""
                {"status": 1, "product": {"product_name": "닭가슴살 소시지", "nutriments": {}}}
                """), "8800000000001").orElseThrow();
        assertThat(r.hasNutrition()).isFalse();
    }

    // ---- 영양 DB 대조 ----

    @Test
    void 이름이_같은_행을_고르고_분류_접두어는_무시한다() throws Exception {
        JsonNode items = json("""
                [{"FOOD_NM_KR": "라면_신라면큰사발", "MAKER_NM": "농심"},
                 {"FOOD_NM_KR": "라면_신라면", "MAKER_NM": "(주)농심"}]
                """);
        assertThat(foodDb.pickByName(items, "신라면", "농심"))
                .hasValueSatisfying(i -> assertThat(i.path("FOOD_NM_KR").asText()).isEqualTo("라면_신라면"));
    }

    /**
     * 조건이 무시되면 포털은 DB 첫 행들을 돌려준다 — 이름도 업체도 안 맞으면 절대 고르지 않는다.
     * 고르면 엉뚱한 음식의 칼로리가 들어간다.
     */
    @Test
    void 이름도_업체도_안_맞으면_고르지_않는다() throws Exception {
        JsonNode items = json("""
                [{"FOOD_NM_KR": "김밥_야채", "MAKER_NM": ""},
                 {"FOOD_NM_KR": "라면_짜파게티", "MAKER_NM": "농심"}]
                """);
        assertThat(foodDb.pickByName(items, "신라면", "농심")).isEmpty();
    }

    @Test
    void 업체가_맞으면_이름_포함_관계도_받는다() throws Exception {
        JsonNode items = json("""
                [{"FOOD_NM_KR": "신라면 블랙", "MAKER_NM": "농심"}]
                """);
        assertThat(foodDb.pickByName(items, "신라면블랙 컵", "(주)농심")).isPresent();
        assertThat(foodDb.pickByName(items, "신라면블랙 컵", "오뚜기")).isEmpty();
    }
}
