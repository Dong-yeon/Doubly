package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.diet.dto.BarcodeLookupResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Optional;

/**
 * 바코드 → 제품·영양 — <b>Open Food Facts</b>(오픈 DB, 키 없음, 무료).
 *
 * <p>국내 일반 식품은 적지만 <b>수입 다이어트 식품</b>(프로틴바·파우더·제로 음료 등)은 국제 바코드로
 * 잘 올라와 있다 — 식품안전나라에 없는 쪽을 메운다.
 *
 * <p><b>1회 제공량 값이 있으면 그걸 쓴다.</b> 프로틴바처럼 "한 개"로 먹는 식품은 100g 기준보다 1회
 * 제공량이 기록 단위와 맞는다. 없으면 100g 기준으로, {@code servingSize} 에 기준을 적어 둔다.
 * 나트륨은 g 로 오므로 mg 로 바꾼다. kcal 가 없고 kJ 만 있으면 환산한다.
 *
 * <p>이용 정책상 앱 이름을 밝힌 User-Agent 를 붙인다. 실패는 비어 있음으로 돌려준다.
 */
@Component
public class OpenFoodFactsClient {

    private static final Logger log = LoggerFactory.getLogger(OpenFoodFactsClient.class);

    private static final String FIELDS = "product_name,product_name_ko,brands,serving_size,nutriments";
    private static final String USER_AGENT = "Dubly/1.0 (+https://dubly.co.kr)";

    private final FoodDbProperties properties;
    private final RestClient restClient;

    public OpenFoodFactsClient(FoodDbProperties properties) {
        this.properties = properties;
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(6));
        this.restClient = RestClient.builder().requestFactory(factory)
                .defaultHeader("User-Agent", USER_AGENT).build();
    }

    public boolean isEnabled() {
        return properties.isOpenFoodFactsEnabled();
    }

    public Optional<BarcodeLookupResponse> find(String barcode) {
        if (!isEnabled()) return Optional.empty();
        String base = properties.getOpenFoodFactsBaseUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        String url = "%s/api/v2/product/%s.json?fields=%s".formatted(base, barcode, FIELDS);
        try {
            JsonNode root = restClient.get().uri(URI.create(url)).retrieve().body(JsonNode.class);
            return root == null ? Optional.empty() : parse(root, barcode);
        } catch (HttpClientErrorException.NotFound e) {
            // 없는 바코드는 404 로 온다 — 그건 실패가 아니라 "없음"이다
            return Optional.empty();
        } catch (RestClientException e) {
            log.warn("Open Food Facts 조회 실패: {}", e.getMessage());
            return Optional.empty();
        }
    }

    /** package-private — HTTP 없이 응답 해석만 단위 테스트하기 위해 */
    Optional<BarcodeLookupResponse> parse(JsonNode root, String barcode) {
        if (root.path("status").asInt(0) != 1) return Optional.empty();
        JsonNode p = root.path("product");
        String name = text(p, "product_name_ko");
        if (name == null) name = text(p, "product_name");
        String brand = text(p, "brands");
        if (brand != null && brand.contains(",")) brand = brand.substring(0, brand.indexOf(',')).trim();
        if (name == null) name = brand;
        if (name == null) return Optional.empty();
        if (brand != null && !name.toLowerCase().contains(brand.toLowerCase())) {
            name = brand + " " + name;   // "Quest Protein Bar" 처럼 브랜드가 곧 구분자인 제품이 많다
        }

        JsonNode n = p.path("nutriments");
        boolean perServing = number(n, "energy-kcal_serving") != null || number(n, "energy_serving") != null;
        String suffix = perServing ? "_serving" : "_100g";
        String basis = perServing ? text(p, "serving_size") : "100g";

        Double kcal = number(n, "energy-kcal" + suffix);
        if (kcal == null) {
            Double kj = number(n, "energy" + suffix);
            if (kj != null) kcal = kj / 4.184;
        }
        Double sodiumG = number(n, "sodium" + suffix);
        return Optional.of(new BarcodeLookupResponse(
                barcode,
                name,
                basis,
                round(kcal),
                round(number(n, "carbohydrates" + suffix)),
                round(number(n, "proteins" + suffix)),
                round(number(n, "fat" + suffix)),
                round(number(n, "sugars" + suffix)),
                sodiumG == null ? null : round(sodiumG * 1000),
                round(number(n, "fiber" + suffix)),
                BarcodeLookupResponse.SOURCE_OPEN_FOOD_FACTS));
    }

    private static String text(JsonNode node, String field) {
        String v = node.path(field).asText("").trim();
        return v.isEmpty() ? null : v;
    }

    /** 숫자 또는 숫자 문자열 — 비었거나 이상하면 null */
    private static Double number(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isNumber()) return v.asDouble();
        if (v.isTextual()) {
            try {
                return Double.parseDouble(v.asText().trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    private static Integer round(Double v) {
        return v == null ? null : (int) Math.round(v);
    }
}
