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
     * 재시도 정책 — <b>어디서 불리느냐</b>에 따라 쓸 수 있는 시간이 다르다.
     *
     * @param maxAttempts         본 호출 포함 최대 시도 횟수
     * @param initialBackoffMillis 첫 재시도 전 대기
     * @param maxBackoffMillis    백오프·{@code Retry-After} 상한
     * @param budgetMillis        재시도까지 포함한 전체 예산. 다음 시도가 이걸 넘길 것 같으면 포기한다
     */
    private record RetryPolicy(int maxAttempts, long initialBackoffMillis,
                               long maxBackoffMillis, long budgetMillis) {
    }

    /**
     * 요청 안에서 도는 호출 — 프론트가 75초에 포기하므로 그 안에서 끝나야 한다.
     *
     * <p>예산 개념이 없으면 "503 두 번 + 본 호출"만으로도 프론트 타임아웃을 넘겨,
     * 재시도가 성공률을 올리는 게 아니라 <b>실패를 늦추기만</b> 한다.
     * 읽기 타임아웃(45초)이 한 번 나면 자연히 예산이 없어 재시도하지 않는 것도 이 계산의 일부다.
     */
    private static final RetryPolicy SYNC = new RetryPolicy(3, 500, 5_000, 60_000);

    /**
     * 백그라운드 작업({@link AiJobService})에서 도는 호출 — 기다려 줄 사람이 없으니 길게 간다.
     *
     * <p><b>이 정책의 근거는 실제 운영 로그다.</b> Gemini 실패는 거의 전부
     * 503 ServiceUnavailable(모델 과부하)이고, 이건 초 단위가 아니라 <b>분 단위</b>로 지속된다.
     * 동기 예산(60초) 안의 재시도로는 그 구간을 넘길 수 없어 사용자에게 그대로 실패로 보였다.
     * 2초 → 6초 → 18초 → 54초 … 로 물러서며 최대 4분까지 버틴다.
     */
    private static final RetryPolicy BACKGROUND = new RetryPolicy(6, 2_000, 60_000, 240_000);

    /**
     * 폴백 모델이 있을 때 1차 모델에 내주는 예산 비율(%).
     *
     * <p>100 을 주면(=전부) 1차 모델이 예산을 다 태우고 폴백은 한 번도 못 돌아본다.
     * 그러면 폴백을 설정한 의미가 없다. 반대로 너무 적게 주면 잠깐 흔들린 1차 모델을
     * 성급하게 포기한다.
     */
    private static final int PRIMARY_BUDGET_PERCENT = 60;

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
        return generateJson(userId, feature, parts, responseSchema, SYNC);
    }

    /**
     * 백그라운드 작업용 — 요청 수명에 매이지 않으므로 <b>분 단위로</b> 재시도한다.
     * 503 이 몇 분씩 이어지는 실제 상황을 넘기려면 이쪽이어야 한다({@link #BACKGROUND} 주석 참고).
     * {@link AiJobService#submit} 안에서 도는 코드에서만 쓸 것 — 요청 스레드에서 부르면
     * 프론트가 먼저 포기한 뒤에도 서버가 4분을 붙잡고 있게 된다.
     */
    public JsonNode generateJsonInBackground(Long userId, Feature feature,
                                             List<Map<String, Object>> parts,
                                             Map<String, Object> responseSchema) {
        return generateJson(userId, feature, parts, responseSchema, BACKGROUND);
    }

    private JsonNode generateJson(Long userId, Feature feature, List<Map<String, Object>> parts,
                                  Map<String, Object> responseSchema, RetryPolicy policy) {
        try {
            return generateJsonOrThrow(parts, responseSchema, policy);
        } catch (RuntimeException e) {
            refundUsage(userId, feature);
            throw e;
        }
    }

    private JsonNode generateJsonOrThrow(List<Map<String, Object>> parts,
                                         Map<String, Object> responseSchema,
                                         RetryPolicy policy) {
        Map<String, Object> body = Map.of(
                "contents", List.of(Map.of("parts", parts)),
                "generationConfig", Map.of(
                        "temperature", 0.2,
                        "responseMimeType", "application/json",
                        "responseSchema", responseSchema));

        JsonNode root = callWithRetry(body, policy);

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
     * Gemini 호출 — 일시적 실패는 짧은 백오프로 재시도하고, 그래도 안 되면 <b>모델을 바꿔</b> 본다.
     *
     * <p><b>예전엔 재시도 대상이 503 뿐이었다.</b> 정작 무료 티어에서 가장 흔한 429(분당 요청
     * 수 초과)는 재시도 없이 바로 실패했다. 지금은 "서버가 지금은 처리 못 했다"고 말한 상태
     * (429·500·502·503·504)와 네트워크 오류를 함께 재시도한다.
     *
     * <p><b>모델 폴백이 필요한 이유는 운영 로그다.</b> 실제로 기록된 Gemini 오류는 사실상 전부
     * 503 ServiceUnavailable — 특정 모델이 과부하라는 뜻이고, 이건 <b>같은 모델로 아무리
     * 다시 물어도</b> 몇 분씩 풀리지 않는다. 그때 필요한 건 더 기다리는 게 아니라 <b>다른
     * 모델에게 묻는 것</b>이다.
     *
     * <p>얼마나 오래 버틸지는 {@link RetryPolicy} 가 정한다. 폴백이 설정돼 있으면 1차 모델에
     * 예산을 다 쓰게 두지 않는다 — 남겨두지 않으면 폴백이 한 번도 돌아보지 못하고 끝난다.
     */
    private JsonNode callWithRetry(Map<String, Object> body, RetryPolicy policy) {
        long start = System.currentTimeMillis();
        long deadline = start + policy.budgetMillis();
        String primary = properties.getModel();
        String fallback = fallbackModelFor(primary);

        long primaryDeadline = fallback == null
                ? deadline
                : start + policy.budgetMillis() * PRIMARY_BUDGET_PERCENT / 100;

        try {
            return callModel(primary, body, policy, primaryDeadline);
        } catch (ModelUnavailable primaryFailure) {
            if (fallback == null || System.currentTimeMillis() >= deadline) {
                throw primaryFailure.toBusinessException();
            }
            log.warn("Gemini 1차 모델({}) 계속 실패 — 폴백 모델({})로 다시 시도", primary, fallback);
            try {
                return callModel(fallback, body, policy, deadline);
            } catch (ModelUnavailable fallbackFailure) {
                log.warn("Gemini 폴백 모델({})도 실패", fallback);
                throw fallbackFailure.toBusinessException();
            }
        }
    }

    /**
     * 폴백에 쓸 모델 — 없거나 1차와 같으면 {@code null}(폴백 안 함).
     * 같은 모델로 폴백하는 건 "한 번 더 재시도"일 뿐이라 예산만 쪼갠다.
     */
    private String fallbackModelFor(String primary) {
        String fallback = properties.getFallbackModel();
        if (fallback == null || fallback.isBlank() || fallback.equals(primary)) {
            return null;
        }
        return fallback;
    }

    /**
     * 한 모델에 대고 {@code deadline} 까지 재시도한다.
     *
     * <p>모델을 바꿔서 달라질 수 있는 실패(서버가 처리 못 하겠다고 한 상태)만
     * {@link ModelUnavailable} 로 올린다. 잘못된 요청(4xx)이나 네트워크 오류는 모델을 바꿔도
     * 똑같으므로 여기서 바로 실패시킨다 — 폴백에 예산을 낭비할 이유가 없다.
     */
    private JsonNode callModel(String model, Map<String, Object> body,
                               RetryPolicy policy, long deadline) {
        long backoffMillis = policy.initialBackoffMillis();
        long lastAttemptMillis = 0;
        for (int attempt = 1; ; attempt++) {
            long attemptStart = System.currentTimeMillis();
            try {
                return restClient.post()
                        .uri(GENERATE_PATH.formatted(properties.getBaseUrl(), model))
                        .header("x-goog-api-key", properties.getApiKey())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(JsonNode.class);
            } catch (RestClientResponseException e) {
                lastAttemptMillis = System.currentTimeMillis() - attemptStart;
                int status = e.getStatusCode().value();
                if (!isTransient(status)) {
                    log.warn("Gemini 호출 실패({}): status={} body={}",
                            model, status, e.getResponseBodyAsString());
                    throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
                }
                long wait = status == 429
                        ? retryAfterMillis(e, backoffMillis, policy.maxBackoffMillis())
                        : backoffMillis;
                if (canRetry(attempt, policy.maxAttempts(), wait, lastAttemptMillis, deadline)) {
                    log.info("Gemini 일시 실패({} {}) — {}ms 후 재시도 ({}/{})",
                            model, status, wait, attempt, policy.maxAttempts());
                    sleep(wait);
                    backoffMillis = Math.min(backoffMillis * 3, policy.maxBackoffMillis());
                    continue;
                }
                log.warn("Gemini 재시도 소진({}): status={}", model, status);
                throw new ModelUnavailable(status == 429 || status == 503
                        ? ErrorCode.AI_RATE_LIMITED : ErrorCode.AI_ANALYSIS_FAILED);
            } catch (ResourceAccessException e) {
                lastAttemptMillis = System.currentTimeMillis() - attemptStart;
                /*
                 * 연결 실패(5초)면 예산이 남아 재시도할 값어치가 있고, 읽기 타임아웃(45초)이면
                 * 아래 검사가 걸러낸다 — 직전 시도가 얼마나 걸렸는지로 판단하기 때문이다.
                 * 모델을 바꿔도 네트워크는 그대로라 폴백으로 넘기지 않는다.
                 */
                if (canRetry(attempt, policy.maxAttempts(), backoffMillis, lastAttemptMillis, deadline)) {
                    log.info("Gemini 네트워크 오류({}) — {}ms 후 재시도 ({}/{}): {}",
                            model, backoffMillis, attempt, policy.maxAttempts(), e.getMessage());
                    sleep(backoffMillis);
                    backoffMillis = Math.min(backoffMillis * 3, policy.maxBackoffMillis());
                    continue;
                }
                log.warn("Gemini 호출 타임아웃/네트워크 오류({}): {}", model, e.getMessage());
                throw new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
            }
        }
    }

    /**
     * "이 모델로는 안 된다" — 재시도를 다 쓰고도 서버가 처리하지 못한 상태.
     * 폴백 모델을 시도할지 판단하려고 일반 실패와 구분한다.
     */
    private static final class ModelUnavailable extends RuntimeException {
        private final ErrorCode errorCode;

        ModelUnavailable(ErrorCode errorCode) {
            super(errorCode.getMessage(), null, false, false); // 스택트레이스 불필요 — 흐름 제어용
            this.errorCode = errorCode;
        }

        BusinessException toBusinessException() {
            return new BusinessException(errorCode);
        }
    }

    /** 서버가 "지금은 처리 못 했다"고 말한 상태 — 같은 요청을 다시 보내면 될 수 있다. */
    private static boolean isTransient(int status) {
        return status == 429 || status == 500 || status == 502 || status == 503 || status == 504;
    }

    /**
     * 다음 시도를 시작해도 되는가.
     *
     * <p>남은 시간과 비교할 "다음 시도에 걸릴 시간"은 <b>직전 시도에 실제로 걸린 시간</b>으로
     * 잡는다. 이게 없으면 45초짜리 읽기 타임아웃 뒤에도 "0.5초 뒤 재시도"가 예산 안으로
     * 보여서, 예산 60초짜리 호출이 90초까지 늘어난다 — 프론트는 이미 포기한 뒤다.
     * 빠르게 떨어지는 503(수백 ms)은 이 추정도 작아서 정상적으로 재시도된다.
     */
    private static boolean canRetry(int attempt, int maxAttempts, long waitMillis,
                                    long lastAttemptMillis, long deadline) {
        return attempt < maxAttempts
                && System.currentTimeMillis() + waitMillis + lastAttemptMillis <= deadline;
    }

    /**
     * 429 의 {@code Retry-After}(초) 를 존중하되 정책의 상한을 넘지 않는다 — 구글이 부른 시간이
     * 우리 예산보다 길면 기다릴 게 아니라 실패시킬 상황이다.
     * 헤더가 없거나 형식이 어긋나면 백오프를 쓴다.
     */
    private static long retryAfterMillis(RestClientResponseException e,
                                         long fallbackMillis, long maxMillis) {
        String header = e.getResponseHeaders() == null
                ? null : e.getResponseHeaders().getFirst("Retry-After");
        if (header == null || header.isBlank()) {
            return fallbackMillis;
        }
        try {
            return Math.min(Long.parseLong(header.trim()) * 1000L, maxMillis);
        } catch (NumberFormatException ignored) {
            return fallbackMillis; // HTTP-date 형식 — 이 API 에서는 오지 않는다
        }
    }

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
