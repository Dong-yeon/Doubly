package com.fitto.diet.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.config.FoodDbProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.BarcodeLookupResponse;
import jakarta.annotation.PostConstruct;
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

    /**
     * 식품영양성분DB정보 서비스 ID.
     *
     * <p>⚠️ <b>2026-09-12: 이 ID 는 더 이상 없다.</b> 아무 키로 불러도 {@code ERROR-310}
     * ("해당하는 서비스를 찾을 수 없습니다")가 돌아온다 — 인증 실패는 {@code INFO-100} 이므로
     * 키와 무관한 판정이다. 즉 <b>식품 DB 조회(바코드·이름 검색)는 동작하지 않는다.</b>
     * 데이터셋이 어디로 갔는지(식품안전나라의 새 서비스 ID인지, 공공데이터포털로 이전인지)
     * 확인한 뒤 이 상수와 {@link #fetchRows}·{@link #map} 을 함께 고쳐야 한다.
     * 경위는 {@code docs/DIET_FOOD_SEARCH_2026-09-12.md} 에 있다.
     */
    private static final String SERVICE_ID = "I2790";

    /** 정상 처리 — 식품안전나라는 오류도 HTTP 200 + {@code RESULT.CODE} 로 돌려준다 */
    private static final String CODE_SUCCESS = "INFO-000";

    /** 해당 데이터 없음 — 오류가 아니다(검색은 빈 목록, 바코드는 미등록으로 이어진다) */
    private static final String CODE_NO_DATA = "INFO-200";

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

    /**
     * 키 모양이 이 API 와 맞는지 부팅 때 한 번 검사한다.
     *
     * <p><b>왜 필요한가.</b> 식품안전나라는 인증키를 <b>경로 세그먼트</b>에 넣는다
     * ({@code /api/{키}/I2790/json/1/1}). 그래서 키에 {@code /} 가 있으면 어떻게 넣어도 실패한다 —
     * 원본으로 넣으면 경로가 쪼개지고, {@code %2F} 로 인코딩하면 Apache 가
     * {@code AllowEncodedSlashes Off} 기본값으로 거부한다. 둘 다 <b>HTML 404</b> 로 돌아오므로
     * {@link ErrorCode#FOOD_DB_LOOKUP_FAILED} 하나로만 보이고, 원인이 로그에 드러나지 않는다.
     *
     * <p>이 모양({@code /}·{@code +}·{@code ==} 를 포함한 base64)은 보통
     * <b>공공데이터포털(data.go.kr) 서비스키</b>다. 거기는 키가 쿼리 파라미터라 {@code /} 가
     * 문제되지 않지만, base URL·파라미터명·응답 구조가 전부 달라 이 클라이언트로는 부를 수 없다.
     *
     * <p>2026-09-12: 운영 키가 정확히 이 모양이었다. 다만 그게 유일한 문제는 아니다 —
     * {@link #SERVICE_ID} 도 이미 없어져 키를 고쳐도 조회는 살아나지 않는다. 두 실패 모드가
     * 다르므로(키 모양은 Apache HTML 404, 서비스 없음은 JSON {@code ERROR-310}) 각각 남긴다.
     */
    @PostConstruct
    void warnIfKeyShapeUnusable() {
        if (!properties.isConfigured()) return;
        String key = properties.getApiKey();
        if (!looksPathIncompatible(key)) return;
        log.warn("식품 DB 인증키가 경로에 넣을 수 없는 모양이다(길이 {}) — 식품안전나라 키는 영숫자다."
                + " 지금 값은 공공데이터포털(data.go.kr) 서비스키로 보인다. 이 키로는 모든 조회가"
                + " HTML 404 가 된다(Apache 가 경로의 %2F 를 거부). various.foodsafetykorea.go.kr"
                + " 에서 발급한 키로 FOOD_DB_API_KEY 를 교체할 것", key.length());
    }

    /** 로그용 — 경로에 박힌 인증키를 가린다. */
    private String maskKey(String url) {
        String key = properties.getApiKey();
        return key == null || key.isBlank() ? url : url.replace(key, "<KEY>");
    }

    /** 경로 세그먼트에 담을 수 없는 키 — 원본 {@code /} 든 인코딩된 {@code %2F} 든 둘 다 막힌다. */
    static boolean looksPathIncompatible(String key) {
        if (key == null) return false;
        return key.contains("/") || key.toUpperCase().contains("%2F");
    }

    /**
     * 실제로 부를 수 있는 상태인가.
     *
     * <p>키가 있어도 경로에 넣을 수 없는 모양이면(위 {@link #warnIfKeyShapeUnusable} 참고) 요청은
     * 전부 404 다. 그런 키는 <b>없는 것과 같게</b> 다룬다 — 매 조회마다 확정 실패할 HTTP 를
     * 보내지 않고, 키를 제대로 교체하면 코드 변경 없이 다시 살아난다.
     */
    public boolean isConfigured() {
        return properties.isConfigured() && !looksPathIncompatible(properties.getApiKey());
    }

    public BarcodeLookupResponse lookup(String barcode) {
        if (!isConfigured()) {
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
        if (!isConfigured()) {
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
            /*
             * 키를 가린 URL 을 같이 남긴다 — 404 는 "키가 틀렸다"가 아니라 "경로가 없다"는 뜻이라
             * (인증 실패는 200 + RESULT.CODE 로 온다) 이게 없으면 서비스 ID·URL 형식·키 모양 중
             * 무엇이 문제인지 로그만으로는 가릴 수 없다. 키 자체는 절대 남기지 않는다.
             */
            log.warn("식품 DB 조회 실패: {} — 요청 {}", e.getMessage(), maskKey(url));
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        if (root == null) {
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        return extractRows(root, maskKey(url));
    }

    /**
     * 응답에서 행을 꺼내되, <b>{@code RESULT.CODE} 를 먼저 본다.</b>
     *
     * <p>이 API 는 오류도 HTTP 200 으로 돌려준다. 그래서 코드를 보지 않고 {@code row} 만 꺼내면
     * "서비스 없음"({@code ERROR-310})·"인증키 무효"({@code INFO-100}) 가 모두 <b>데이터 없음</b>으로
     * 번역돼, 사용자에게는 "등록되지 않은 바코드예요"로 보이고 로그에는 아무것도 남지 않는다.
     * 2026-09-12 에 식품 DB 가 통째로 죽어 있는 걸 늦게 알아챈 이유가 이것이다.
     *
     * <p>package-private — HTTP 없이 이 분기만 단위 테스트하기 위해.
     */
    JsonNode extractRows(JsonNode root, String requestForLog) {
        JsonNode service = root.path(SERVICE_ID);
        JsonNode result = service.path("RESULT");
        String code = result.path("CODE").asText("");
        if (!code.isBlank() && !CODE_SUCCESS.equals(code) && !CODE_NO_DATA.equals(code)) {
            log.warn("식품 DB 가 오류를 돌려줬다 code={} msg={} — 요청 {}",
                    code, result.path("MSG").asText(""), requestForLog);
            throw new BusinessException(ErrorCode.FOOD_DB_LOOKUP_FAILED);
        }
        return service.path("row");
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
