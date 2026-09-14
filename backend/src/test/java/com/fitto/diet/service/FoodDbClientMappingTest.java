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
 * 식품영양성분DB정보(공공데이터포털) 응답 매핑 — HTTP 없는 순수 단위 테스트.
 *
 * <p>필드명은 2026-09-12 실제 응답 + 참고문서(출력메세지_식품영양성분DB정보.xlsx)로 대조했다.
 * 옛 {@code NUTR_CONT} 순서와 다르므로(3=단백질·6=탄수화물) 자리 바꿈을 여기서 붙잡는다.
 */
class FoodDbClientMappingTest {

    private final FoodDbClient client = new FoodDbClient(new FoodDbProperties());
    private final ObjectMapper objectMapper = new ObjectMapper();

    private JsonNode json(String raw) throws Exception {
        return objectMapper.readTree(raw);
    }

    /** 실제 응답에서 가져온 행(김밥, 밥류) — 질량 합계가 100g 으로 닫히는 것으로 매핑을 확인했다. */
    @Test
    void 실제_응답_행을_매핑한다() throws Exception {
        JsonNode item = json("""
                {
                  "FOOD_NM_KR": "김밥_야채",
                  "SERVING_SIZE": "100g",
                  "AMT_NUM1": "137.000",
                  "AMT_NUM2": "71.60",
                  "AMT_NUM3": "6.70",
                  "AMT_NUM4": "5.16",
                  "AMT_NUM5": "0.63",
                  "AMT_NUM6": "15.94",
                  "AMT_NUM7": "0.16",
                  "AMT_NUM8": "0.70",
                  "AMT_NUM13": "181.000"
                }
                """);

        BarcodeLookupResponse res = client.map(item);

        assertThat(res.foodName()).isEqualTo("김밥_야채");
        assertThat(res.servingSize()).isEqualTo("100g");
        assertThat(res.calories()).isEqualTo(137);
        assertThat(res.carbs()).isEqualTo(16);      // AMT_NUM6 — 옛 매핑은 여기서 단백질을 넣었다
        assertThat(res.protein()).isEqualTo(7);     // AMT_NUM3
        assertThat(res.fat()).isEqualTo(5);
        assertThat(res.sugar()).isZero();
        assertThat(res.fiber()).isEqualTo(1);
        assertThat(res.sodium()).isEqualTo(181);
        assertThat(res.barcode()).isEmpty();        // 이 데이터셋에 바코드가 없다
    }

    /** 값 없는 항목은 null 이 아니라 <b>빈 문자열</b>로 온다 — 0 으로 읽으면 안 된다. */
    @Test
    void 빈_문자열은_null이_된다() throws Exception {
        JsonNode item = json("""
                { "FOOD_NM_KR": "정보 부족 식품", "AMT_NUM1": "", "AMT_NUM13": "" }
                """);

        BarcodeLookupResponse res = client.map(item);

        assertThat(res.foodName()).isEqualTo("정보 부족 식품");
        assertThat(res.calories()).isNull();
        assertThat(res.sodium()).isNull();
    }

    /** 큰 값에는 천 단위 쉼표가 붙는다("1,670.000"). */
    @Test
    void 천_단위_쉼표가_붙은_숫자를_읽는다() throws Exception {
        assertThat(client.map(json("""
                { "AMT_NUM13": "1,670.000" }
                """)).sodium()).isEqualTo(1670);
    }

    @Test
    void 숫자로_파싱할_수_없는_값은_예외_없이_null이_된다() throws Exception {
        assertThat(client.map(json("""
                { "AMT_NUM1": "정보없음" }
                """)).calories()).isNull();
    }

    /**
     * 포털 API 는 오류도 HTTP 200 + {@code header.resultCode} 로 준다. 코드를 안 보면
     * "인증키 미등록"이 "데이터 없음"으로 번역돼 조용히 묻힌다 — 실제로 그렇게 묻혀 있었다.
     */
    @Test
    void 오류_코드를_데이터_없음으로_넘기지_않는다() throws Exception {
        JsonNode root = json("""
                {"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}
                """);

        assertThatThrownBy(() -> client.extractItems(root, "요청"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FOOD_DB_LOOKUP_FAILED);
    }

    @Test
    void 정상_코드면_항목을_그대로_돌려준다() throws Exception {
        JsonNode root = json("""
                {"header":{"resultCode":"00","resultMsg":"NORMAL SERVICE."},
                 "body":{"pageNo":1,"totalCount":319060,"numOfRows":1,
                         "items":[{"FOOD_NM_KR":"김밥_야채"}]}}
                """);

        JsonNode items = client.extractItems(root, "요청");

        assertThat(items.isArray()).isTrue();
        assertThat(items.get(0).path("FOOD_NM_KR").asText()).isEqualTo("김밥_야채");
    }

    /**
     * 포털은 Encoding/Decoding 두 형태의 키를 준다. Encoding 키를 다시 인코딩하면
     * {@code %2F} → {@code %252F} 로 깨지고, Decoding 키를 그냥 넣으면 {@code +} 가 공백이 된다.
     */
    @Test
    void 인증키가_이미_인코딩된_형태인지_가른다() {
        assertThat(FoodDbClient.looksPercentEncoded("JL9aMaP%2F1Grq%2B6Nz%3D%3D")).isTrue();
        assertThat(FoodDbClient.looksPercentEncoded("JL9aMaP/1Grq+6Nz==")).isFalse();
        assertThat(FoodDbClient.looksPercentEncoded("abcdef0123456789")).isFalse();
        assertThat(FoodDbClient.looksPercentEncoded(null)).isFalse();
    }
}
