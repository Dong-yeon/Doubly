package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.FoodDbProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * 바코드 → 제품(이름·업체·품목보고번호) — <b>식품안전나라</b> OpenAPI.
 *
 * <p>영양정보는 여기 없다. 이 API 는 "이 바코드가 무슨 제품인가"만 알려 주고, 영양은
 * {@link FoodDbClient#findForProduct} 가 품목보고번호·이름으로 식약처 영양성분 DB 에서 찾는다.
 *
 * <p>서비스 두 개를 차례로 본다.
 * <ul>
 *   <li>{@code I2570} 유통바코드 — {@code BRCD_NO} 로 찾는다.</li>
 *   <li>{@code C005} 바코드연계제품정보 — {@code BAR_CD}. 2018년 이후 갱신이 멈췄지만 오래된 스테디셀러는 있다.</li>
 * </ul>
 *
 * <p><b>필드 이름은 공개 명세 기준이고 실응답으로 대조하지 못했다</b>(2026-09-29, 이 환경에서 외부 호출 불가).
 * 그래서 제품명·업체 필드를 여럿 받아 두고, 응답 코드가 "정상/데이터 없음"이 아니면 로그를 남긴다 —
 * 키를 넣고 처음 돌릴 때 로그로 확인한다(docs/BARCODE_LOOKUP_2026-09-29.md §5).
 *
 * <p>실패(키 없음·네트워크·형식 변경)는 전부 비어 있음으로 돌려준다 — 다음 단계로 넘어가야 한다.
 */
@Component
public class FoodSafetyBarcodeClient {

    private static final Logger log = LoggerFactory.getLogger(FoodSafetyBarcodeClient.class);

    /** 정상 / 데이터 없음 — 그 밖의 코드는 키·서비스 문제라 로그를 남긴다 */
    private static final String CODE_OK = "INFO-000";
    private static final String CODE_NO_DATA = "INFO-200";

    /** 조회 서비스와 바코드 조건 이름 */
    private record Service(String id, String barcodeParam) {
    }

    private static final List<Service> SERVICES = List.of(
            new Service("I2570", "BRCD_NO"),
            new Service("C005", "BAR_CD"));

    /** 바코드로 찾은 제품 */
    public record Product(String name, String maker, String reportNo) {
    }

    private final FoodDbProperties properties;
    private final RestClient restClient;

    public FoodSafetyBarcodeClient(FoodDbProperties properties) {
        this.properties = properties;
        HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(4)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(6));
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    public boolean isConfigured() {
        return properties.isFoodSafetyConfigured();
    }

    public Optional<Product> find(String barcode) {
        if (!isConfigured()) return Optional.empty();
        for (Service service : SERVICES) {
            Optional<Product> found = fetch(service, barcode);
            if (found.isPresent()) return found;
        }
        return Optional.empty();
    }

    private Optional<Product> fetch(Service service, String barcode) {
        String base = properties.getFoodSafetyBaseUrl();
        if (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        // 키는 경로에 들어간다(영숫자). 바코드는 숫자만 오므로 인코딩할 것이 없다
        String url = "%s/%s/%s/json/1/5/%s=%s".formatted(
                base, properties.getFoodSafetyApiKey().trim(), service.id(), service.barcodeParam(), barcode);
        try {
            JsonNode root = restClient.get().uri(URI.create(url)).retrieve().body(JsonNode.class);
            return root == null ? Optional.empty() : parse(root, service.id());
        } catch (RestClientException | IllegalArgumentException e) {
            log.warn("식품안전나라 {} 조회 실패: {}", service.id(), e.getMessage());
            return Optional.empty();
        }
    }

    /** package-private — HTTP 없이 응답 해석만 단위 테스트하기 위해 */
    Optional<Product> parse(JsonNode root, String serviceId) {
        JsonNode body = root.path(serviceId);
        String code = body.path("RESULT").path("CODE").asText(root.path("RESULT").path("CODE").asText(""));
        if (!code.isEmpty() && !CODE_OK.equals(code) && !CODE_NO_DATA.equals(code)) {
            log.warn("식품안전나라 {} 가 오류를 돌려줬다 code={} msg={}", serviceId, code,
                    body.path("RESULT").path("MSG").asText(root.path("RESULT").path("MSG").asText("")));
            return Optional.empty();
        }
        for (JsonNode row : body.path("row")) {
            String name = first(row, "PRDT_NM", "PRDLST_NM", "PRODUCT_NM");
            if (name == null) continue;
            return Optional.of(new Product(name,
                    first(row, "CMPNY_NM", "BSSH_NM", "MAKER_NM"),
                    first(row, "PRDLST_REPORT_NO", "ITEM_REPORT_NO")));
        }
        return Optional.empty();
    }

    private static String first(JsonNode row, String... fields) {
        for (String f : fields) {
            String v = row.path(f).asText("").trim();
            if (!v.isEmpty()) return v;
        }
        return null;
    }
}
