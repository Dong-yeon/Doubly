package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.Quota;
import com.fitto.common.plan.UsageCounter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Base64;
import java.util.List;
import java.util.Map;

/**
 * Gemini API 공용 클라이언트 — 음식 사진 분석/운동 추천 등 AI 기능이 공유한다.
 *
 * <p><b>한도는 세 겹이고, 겹마다 지키는 대상이 다르다.</b>
 * <ol>
 *   <li><b>기능별 · 플랜별</b> 한도 — {@link PlanGuard}. 무료는 음식 사진 분석 하루 2회,
 *       PRO 는 30회처럼 기능마다 다르다. 숫자는 {@link Feature} 한 곳에 모여 있다.
 *       지키는 대상: 요금제 설계</li>
 *   <li><b>사용자별 총량</b> — {@code fitto.gemini.daily-limit-per-user}.
 *       지키는 대상: 한 사람이 서비스를 독식하는 것(남용 방지)</li>
 *   <li><b>서비스 전체 총량</b> — {@code fitto.gemini.daily-limit-total}.
 *       지키는 대상: <b>Google 프로젝트 일일 쿼터</b>. 이게 이 겹의 존재 이유다</li>
 * </ol>
 *
 * <p><b>3번이 왜 따로 있어야 하나.</b> 예전엔 2번 하나가 두 역할을 겸했다(그래서 10 이라는
 * 작은 값이었다). 프로젝트 쿼터는 <b>전체 합</b>에 걸리는데 사용자별 상한으로 막으려니
 * 사용자 수가 늘면 반드시 뚫리고, 동시에 그 작은 값이 기능별 한도를 통째로 무의미하게
 * 만들었다 — PRO 에게 음식 사진 30회를 준다고 해놓고 실제로는 앱을 한 바퀴 도는 것만으로
 * 10회를 다 쓰게 했다. 역할을 갈라놓으니 2번은 넉넉하게, 3번은 실제 쿼터에 맞게 잡을 수 있다.
 *
 * <p><b>실패하면 개인 한도는 돌려준다.</b> 선차감이 원칙이지만(PlanGuard.consume 참고),
 * 그 근거였던 "실패해도 외부 쿼터는 먹었다"는 이제 3번이 따로 지킨다. 그래서 결과를 하나도
 * 주지 못한 실패는 1·2번을 되돌린다 — 3번은 되돌리지 않는다(구글은 이미 처리했을 수 있다).
 * 이 비대칭이 되돌림을 남용 우회로로 만들지 않는 지점이다.
 *
 * <p>카운터는 {@link UsageCounter}(Redis INCR, 미가용 시 인메모리 폴백)가 담당한다.
 */
@Component
public class GeminiClient {

    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    /** {@code {baseUrl}/{model}:generateContent} — 베이스는 GeminiProperties 가 준다. */
    private static final String GENERATE_PATH = "%s/%s:generateContent";

    /**
     * 한 번의 HTTP 응답을 기다리는 시간.
     *
     * <p>이 값과 <b>프론트의 AI 타임아웃은 반드시 벌어져 있어야 한다</b>. 예전엔 둘 다 60초라,
     * 서버가 60초를 꽉 채우는 순간 클라이언트도 정확히 같은 순간에 abort 했다 — 서버는
     * 계속 돌고 클라이언트는 이미 포기한, 아무도 결과를 못 받는 상태다.
     * 지금은 서버 45초 / 프론트 75초로, <b>서버가 먼저 지고 그 실패를 프론트가 받아본다</b>.
     */
    private static final int READ_TIMEOUT_MILLIS = 45_000;

    /**
     * 재시도까지 포함한 <b>전체</b> 예산. 이걸 넘길 것 같으면 재시도하지 않는다.
     *
     * <p>예산 개념이 없으면 "503 두 번 + 본 호출"만으로도 프론트 타임아웃을 넘겨,
     * 재시도가 성공률을 올리는 게 아니라 <b>실패를 늦추기만</b> 한다.
     * 읽기 타임아웃(45초)이 한 번 나면 자연히 예산이 없어 재시도하지 않는 것도 이 계산의 일부다.
     */
    private static final long TOTAL_BUDGET_MILLIS = 60_000;

    private final GeminiProperties properties;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final PlanGuard planGuard;
    private final UsageCounter usageCounter;

    public GeminiClient(GeminiProperties properties, ObjectMapper objectMapper,
                        PlanGuard planGuard, UsageCounter usageCounter) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.planGuard = planGuard;
        this.usageCounter = usageCounter;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(READ_TIMEOUT_MILLIS);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * AI 기능 사용 전 공통 관문 — 키 설정 확인 + 플랜 한도 차감 + 총량 안전망.
     *
     * <p>양방향으로 서로의 한도를 갉아먹지 않게 <b>확인(peek) → 커밋(increment) 순서</b>를 지킨다.
     * <ol>
     *   <li>총량을 먼저 <b>peek</b> 만 한다 — 여기서 막히면 기능별 한도는 건드리지 않는다.
     *       (반대로 하면, 총량에 막혀 Gemini 를 한 번도 못 부른 요청이 월 1회·주 1회 같은
     *       희소한 기능 한도를 그냥 날려버린다 — 실제로 있었던 누수)</li>
     *   <li>기능별 한도는 {@link PlanGuard#consume} 이 커밋한다 — 막힌 기능이면 여기서 던지므로
     *       아래 총량 커밋까지 가지 않는다(무료에서 막힌 기능이 총량을 갉아먹지 않는다)</li>
     *   <li>기능 한도까지 통과했을 때만 총량을 <b>커밋</b>한다. peek 과 이 커밋 사이의 짧은 창에서
     *       동시 요청이 겹치면 드물게 총량이 살짝 넘칠 수 있는데, 이는 카운터 자체의 기존 동시성
     *       허용 범위와 같은 성격이라 별도 처리하지 않는다.</li>
     * </ol>
     *
     * <p>서비스 전체 총량도 같은 자리에서 함께 본다. 이건 <b>구글 쿼터가 먼저 터지는 것</b>을
     * 막는 용도라, 걸렸을 때의 메시지도 "내 한도 소진"과 달라야 한다 — 사용자 잘못이 아니다.
     */
    public void requireConfiguredAndCountUsage(Long userId, Feature feature) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.AI_NOT_CONFIGURED);
        }

        Quota serviceWide = Quota.perDay(properties.getDailyLimitTotal());
        if (usageCounter.peekGlobal(Feature.AI_TOTAL, serviceWide) >= serviceWide.limit()) {
            log.warn("AI 서비스 전체 일일 한도 도달 — limit={}", serviceWide.limit());
            throw new BusinessException(ErrorCode.AI_SERVICE_LIMIT_EXCEEDED);
        }

        Quota backstop = Quota.perDay(properties.getDailyLimitPerUser());
        if (usageCounter.peek(userId, Feature.AI_TOTAL, backstop) >= backstop.limit()) {
            throw new BusinessException(ErrorCode.AI_DAILY_LIMIT_EXCEEDED);
        }

        planGuard.consume(userId, feature);

        if (usageCounter.increment(userId, Feature.AI_TOTAL, backstop) > backstop.limit()) {
            throw new BusinessException(ErrorCode.AI_DAILY_LIMIT_EXCEEDED);
        }
        usageCounter.incrementGlobal(Feature.AI_TOTAL, serviceWide);
    }

    /**
     * 결과를 하나도 주지 못한 실패 뒤에 개인 한도를 되돌린다 — 클래스 주석의 1·2번만.
     *
     * <p>서비스 전체 총량(3번)은 되돌리지 않는다. 우리가 실패로 처리했어도 구글은 요청을
     * 이미 처리했을 수 있고, 그러면 프로젝트 쿼터는 실제로 줄어 있다. 되돌리면 그 방어선이
     * 실패 횟수만큼 헐거워진다.
     */
    private void refundUsage(Long userId, Feature feature) {
        planGuard.refund(userId, feature);
        usageCounter.decrement(userId, Feature.AI_TOTAL,
                Quota.perDay(properties.getDailyLimitPerUser()));
    }

    /**
     * parts(텍스트/이미지)를 보내 구조화 출력(JSON mode) 결과를 파싱해 반환.
     *
     * <p>{@code userId}·{@code feature} 를 받는 이유는 <b>실패 시 되돌리기</b> 하나다
     * (클래스 주석 "실패하면 개인 한도는 돌려준다" 참고). 차감은 여전히 호출 전에
     * {@link #requireConfiguredAndCountUsage} 가 한다 — 비싼 준비(이미지 다운로드 등)를
     * 시작하기 전에 막아야 하기 때문이다.
     */
    public JsonNode generateJson(Long userId, Feature feature,
                                 List<Map<String, Object>> parts, Map<String, Object> responseSchema) {
        try {
            return generateJsonOrThrow(parts, responseSchema);
        } catch (RuntimeException e) {
            refundUsage(userId, feature);
            throw e;
        }
    }

    private JsonNode generateJsonOrThrow(List<Map<String, Object>> parts,
                                         Map<String, Object> responseSchema) {
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", parts)),
                "generationConfig", Map.of(
                        "temperature", 0.2,
                        "responseMimeType", "application/json",
                        "responseSchema", responseSchema));

        JsonNode root = callWithRetry(body);

        String text = root == null ? null
                : root.path("candidates").path(0).path("content")
                        .path("parts").path(0).path("text").asText(null);
        if (text == null || text.isBlank()) {
            log.warn("Gemini 응답에 결과 텍스트 없음: {}", root);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
        try {
            return objectMapper.readTree(text);
        } catch (Exception e) {
            log.warn("Gemini 결과 JSON 파싱 실패: {}", text);
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
    }

    /**
     * Gemini 호출 — 일시적 실패는 짧은 백오프로 자동 재시도한다.
     *
     * <p><b>예전엔 재시도 대상이 503 뿐이었다.</b> 정작 무료 티어에서 가장 흔한 429(분당 요청
     * 수 초과)는 재시도 없이 바로 실패했는데, 429 야말로 잠깐 기다리면 풀리는 대표적인
     * 경우다. 지금은 "서버가 지금은 처리 못 했다"고 말한 상태(429·500·502·503·504)와
     * 네트워크 오류를 함께 재시도한다.
     *
     * <p>재시도는 {@link #TOTAL_BUDGET_MILLIS} 예산 안에서만 한다. 다음 시도가 예산을 넘길
     * 것 같으면 그냥 실패시킨다 — 어차피 프론트가 먼저 포기할 응답을 만들어봐야 소용없다.
     */
    private JsonNode callWithRetry(Map<String, Object> body) {
        long deadline = System.currentTimeMillis() + TOTAL_BUDGET_MILLIS;
        int maxAttempts = 3;
        long backoffMillis = 500;
        for (int attempt = 1; ; attempt++) {
            try {
                return restClient.post()
                        .uri(GENERATE_PATH.formatted(properties.getBaseUrl(), properties.getModel()))
                        .header("x-goog-api-key", properties.getApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
            } catch (RestClientResponseException e) {
                int status = e.getStatusCode().value();
                long wait = status == 429 ? retryAfterMillis(e, backoffMillis) : backoffMillis;
                if (isTransient(status) && canRetry(attempt, maxAttempts, wait, deadline)) {
                    log.info("Gemini 일시 실패({}) — {}ms 후 재시도 ({}/{})",
                            status, wait, attempt, maxAttempts);
                    sleep(wait);
                    backoffMillis *= 3;
                    continue;
                }
                log.warn("Gemini 호출 실패: status={} body={}", status, e.getResponseBodyAsString());
                throw new BusinessException(status == 429 || status == 503
                        ? ErrorCode.AI_RATE_LIMITED : ErrorCode.AI_ANALYSIS_FAILED);
            } catch (ResourceAccessException e) {
                /*
                 * 연결 실패(5초)면 예산이 넉넉히 남아 재시도할 값어치가 있고, 읽기
                 * 타임아웃(45초)이면 예산이 남지 않아 아래 검사에서 자연히 걸러진다.
                 * 둘을 예외 메시지로 구분하는 것보다 남은 시간으로 판단하는 쪽이 정확하다.
                 */
                if (canRetry(attempt, maxAttempts, backoffMillis, deadline)) {
                    log.info("Gemini 네트워크 오류 — {}ms 후 재시도 ({}/{}): {}",
                            backoffMillis, attempt, maxAttempts, e.getMessage());
                    sleep(backoffMillis);
                    backoffMillis *= 3;
                    continue;
                }
                log.warn("Gemini 호출 타임아웃/네트워크 오류: {}", e.getMessage());
                throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
            }
        }
    }

    /** 서버가 "지금은 처리 못 했다"고 말한 상태 — 같은 요청을 다시 보내면 될 수 있다. */
    private static boolean isTransient(int status) {
        return status == 429 || status == 500 || status == 502 || status == 503 || status == 504;
    }

    /** 대기까지 마친 다음 시도가 예산 안에서 끝날 가망이 있는가. */
    private static boolean canRetry(int attempt, int maxAttempts, long waitMillis, long deadline) {
        return attempt < maxAttempts && System.currentTimeMillis() + waitMillis < deadline;
    }

    /**
     * 429 의 {@code Retry-After}(초) 를 존중하되 상한을 둔다 — 구글이 몇 분을 부르면
     * 그건 기다릴 게 아니라 실패시킬 상황이다. 헤더가 없거나 형식이 어긋나면 백오프를 쓴다.
     */
    private static long retryAfterMillis(RestClientResponseException e, long fallbackMillis) {
        String header = e.getResponseHeaders() == null
                ? null : e.getResponseHeaders().getFirst("Retry-After");
        if (header == null || header.isBlank()) {
            return fallbackMillis;
        }
        try {
            return Math.min(Long.parseLong(header.trim()) * 1000L, MAX_RETRY_AFTER_MILLIS);
        } catch (NumberFormatException ignored) {
            return fallbackMillis; // HTTP-date 형식 — 이 API 에서는 오지 않는다
        }
    }

    private static final long MAX_RETRY_AFTER_MILLIS = 5_000;

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }
    }

    public static Map<String, Object> textPart(String text) {
        return Map.of("text", text);
    }

    public static Map<String, Object> imagePart(String mimeType, byte[] bytes) {
        return Map.of("inlineData", Map.of(
                "mimeType", mimeType,
                "data", Base64.getEncoder().encodeToString(bytes)));
    }
}
