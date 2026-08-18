package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 바코드 식품 DB(식품안전나라 식품영양성분DB정보, I2790) 설정 바인딩 — application.yml 의 fitto.food-db.*
 * 발급: 식품안전나라 OpenAPI(https://various.foodsafetykorea.go.kr/nutrient) 회원가입 후 인증키 발급.
 * 비어 있으면 바코드 조회 기능만 비활성 — {@link com.fitto.diet.service.FoodDbClient} 참고.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.food-db")
public class FoodDbProperties {

    /** 식품안전나라 OpenAPI 인증키. 비어 있으면 바코드 조회 비활성. */
    private String apiKey = "";

    /** API 베이스 URL — 서비스 ID(I2790)까지는 클라이언트가 붙인다. */
    private String baseUrl = "http://openapi.foodsafetykorea.go.kr/api";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }
}
