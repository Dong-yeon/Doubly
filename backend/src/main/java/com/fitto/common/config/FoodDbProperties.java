package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 식품 DB 설정 바인딩 — application.yml 의 fitto.food-db.*
 *
 * <p>발급: <b>공공데이터포털</b>(data.go.kr) "식품의약품안전처_식품영양성분DB정보" 활용신청 후
 * 일반 인증키. 식품안전나라의 옛 {@code I2790} 은 종료됐다(경위: FoodDbClient 클래스 주석).
 * 키는 <b>쿼리 파라미터</b>({@code serviceKey})로 들어가므로 Encoding/Decoding 어느 형태든 된다.
 * 비어 있으면 식품 DB 조회만 조용히 비활성 — {@link com.fitto.diet.service.FoodDbClient} 참고.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.food-db")
public class FoodDbProperties {

    /** 공공데이터포털 일반 인증키. 비어 있으면 식품 DB 조회 비활성. */
    private String apiKey = "";

    /** API 엔드포인트 — 상세기능(오퍼레이션) 이름은 클라이언트가 붙인다. */
    private String baseUrl = "https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * <b>식품안전나라</b>(foodsafetykorea.go.kr) OpenAPI 인증키 — 바코드 → 제품명·품목보고번호.
     * 공공데이터포털 키와 <b>다른 키</b>다(영숫자, URL 경로에 들어간다). 비어 있으면 이 단계만 건너뛴다.
     */
    private String foodSafetyApiKey = "";

    private String foodSafetyBaseUrl = "http://openapi.foodsafetykorea.go.kr/api";

    /** Open Food Facts(키 없음) — 수입·다이어트 식품 대비. 테스트는 네트워크를 타지 않게 끈다. */
    private boolean openFoodFactsEnabled = true;

    private String openFoodFactsBaseUrl = "https://world.openfoodfacts.org";

    public boolean isFoodSafetyConfigured() {
        return foodSafetyApiKey != null && !foodSafetyApiKey.isBlank();
    }
}
