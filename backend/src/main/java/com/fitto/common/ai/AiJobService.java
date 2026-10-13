package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import jakarta.annotation.PreDestroy;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * 오래 걸리는 AI 생성을 <b>요청 바깥</b>에서 돌리고, 앱은 결과를 폴링해 가져간다.
 *
 * <p><b>왜 필요한가.</b> 동기 응답은 "HTTP 요청 하나가 살아 있는 동안"이라는 예산에 갇힌다.
 * 실제 운영 로그를 보면 Gemini 실패는 거의 전부 <b>503 ServiceUnavailable</b>(모델 과부하)이고,
 * 이건 몇 초 안에 풀리는 게 아니라 <b>몇 분</b> 지속되기도 한다. 요청 안에서는 아무리 잘
 * 재시도해도 프론트 타임아웃(75초) 전에 포기해야 하니, 사용자에겐 그냥 실패로 보인다.
 * 작업을 요청에서 떼어내면 <b>분 단위로 재시도</b>할 수 있고, 그 사이 사용자는 화면을 떠나도 된다.
 *
 * <p><b>저장소.</b> Redis 문자열 하나 = 작업 하나. 다중 인스턴스에서 A 가 실행하고 B 가
 * 폴링당해도 상태가 보인다. Redis 가 없으면(로컬 개발) 인메모리로 폴백한다 —
 * {@link AiResultCache}·{@code UsageCounter} 와 같은 구성이다.
 *
 * <p><b>실행 풀은 작고 유한하다.</b> 큐가 차면 새 작업을 받지 않고 즉시 실패로 만든다.
 * 무한 대기열을 두면 Gemini 장애 동안 힙만 자라고, 사용자는 영원히 PENDING 을 본다
 * ({@code ExpoPushNotificationService} 와 같은 원칙 — 다만 여기선 버리지 않고 <b>실패를 알린다</b>.
 * 푸시는 유실돼도 되지만 사용자가 버튼을 눌러 기다리는 작업은 그러면 안 된다).
 */
@Component
public class AiJobService {

    private static final Logger log = LoggerFactory.getLogger(AiJobService.class);

    private static final String KEY_PREFIX = "fitto:ai:job:";

    /**
     * 작업 보관 기간. 폴링이 따라올 시간 + 앱이 백그라운드에 다녀올 시간을 감안한 값이다.
     * (작업 자체의 상한은 아래 실행 풀과 Gemini 예산이 정한다)
     */
    private static final Duration RETENTION = Duration.ofMinutes(15);

    /** 인메모리 폴백 최대 항목 — Redis 없는 개발 환경 전용이라 넉넉할 필요가 없다. */
    private static final int FALLBACK_MAX_ENTRIES = 200;

    /** 동시에 돌릴 AI 작업 수 — 외부 대기라 CPU 수와 무관하고, 늘릴수록 Gemini 한도를 빨리 쓴다. */
    private static final int AI_JOB_THREADS = 4;

    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final ObjectMapper objectMapper;

    private final Map<String, Entry> fallback = new LinkedHashMap<>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
            return size() > FALLBACK_MAX_ENTRIES;
        }
    };

    private record Entry(String json, Instant expiresAt) {
    }

    /**
     * AI 생성 전용 풀. 스레드가 적은 이유는 이 작업들이 CPU 가 아니라 <b>외부 응답 대기</b>라
     * 많이 띄워봐야 Gemini 쪽 한도만 더 빨리 건드리기 때문이다.
     *
     * <p><b>core 와 max 를 같게 둔 건 의도적이다.</b> ThreadPoolExecutor 는 큐가 <b>가득 찬 뒤에야</b>
     * core 를 넘겨 스레드를 늘린다. core=2, max=4, 큐 100 으로 두면 큐에 99개가 쌓일 때까지
     * 실제 동시 실행은 2개뿐이다 — 작업 하나가 몇 분씩 걸리는 여기선 그게 곧 대기열이 된다.
     * 대신 {@code allowCoreThreadTimeOut} 으로 놀면 스레드를 반납한다.
     */
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            AI_JOB_THREADS, AI_JOB_THREADS, 60, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            r -> {
                Thread t = new Thread(r, "ai-job");
                t.setDaemon(true);
                return t;
            });

    {
        executor.allowCoreThreadTimeOut(true);
    }

    private final MeterRegistry meterRegistry;

    public AiJobService(ObjectProvider<StringRedisTemplate> redisProvider, ObjectMapper objectMapper,
                        MeterRegistry meterRegistry) {
        this.redisProvider = redisProvider;
        this.objectMapper = objectMapper;
        this.meterRegistry = meterRegistry;
        /*
         * 대기열이 쌓이는 건 "AI 가 느리다"의 가장 이른 신호다 — 사용자가 체감하기 전에 보인다.
         * 실행 중 개수와 함께 보면 "풀이 모자란 건지, 작업 하나가 오래 걸리는 건지"가 갈린다.
         */
        Gauge.builder("fitto.ai.job.queued", executor, e -> e.getQueue().size())
                .description("실행을 기다리는 AI 작업 수")
                .register(meterRegistry);
        Gauge.builder("fitto.ai.job.active", executor, ThreadPoolExecutor::getActiveCount)
                .description("지금 돌고 있는 AI 작업 수")
                .register(meterRegistry);
    }

    private void countFinished(String label, String outcome) {
        Counter.builder("fitto.ai.job.finished")
                .description("끝난 AI 작업 수")
                .tag("job", label)
                .tag("outcome", outcome)
                .register(meterRegistry)
                .increment();
    }

    /**
     * 작업을 등록하고 <b>즉시</b> 작업 id 를 돌려준다. 실제 생성은 백그라운드에서 일어난다.
     *
     * @param work 결과를 만드는 일. 여기서 던진 {@link BusinessException} 은 그대로
     *             사용자에게 보여줄 메시지가 된다(한도 초과·AI 실패 등)
     */
    public String submit(Long userId, String label, Supplier<?> work) {
        return submit(userId, label, work, null);
    }

    /**
     * @param onRejected 큐 포화로 작업이 실행조차 못 할 때 부른다(null 허용). 접수 전에 한도를 차감하거나
     *                   자원을 올려 둔 호출자가 그것을 되돌리는 자리다 — 작업 안의 실패와 달리 여기서는
     *                   작업 코드가 한 줄도 돌지 않으므로 호출자만 되돌릴 수 있다(2026-09-08 점검 #9).
     */
    public String submit(Long userId, String label, Supplier<?> work, Runnable onRejected) {
        String jobId = UUID.randomUUID().toString();
        save(jobId, AiJob.pending(userId));
        try {
            executor.execute(() -> run(jobId, userId, label, work));
        } catch (Exception rejected) {
            // 큐 포화 — PENDING 으로 남겨두면 사용자가 영원히 기다린다. 지금 실패로 못박는다.
            log.warn("AI 작업 큐 포화 — {} 거절 (userId={})", label, userId);
            save(jobId, AiJob.pending(userId).failed(
                    ErrorCode.AI_RATE_LIMITED.name(), ErrorCode.AI_RATE_LIMITED.getMessage()));
            countFinished(label, "rejected");
            if (onRejected != null) {
                try {
                    onRejected.run();
                } catch (RuntimeException e) {
                    // 되돌리기 실패가 접수 응답까지 깨면 안 된다 — 작업은 이미 실패로 기록됐다
                    log.warn("AI 작업 거절 후 되돌리기 실패({}): {}", label, e.toString());
                }
            }
        }
        return jobId;
    }

    // ---- 같은 요청 두 번 막기 ----

    private static final String REQUEST_KEY_PREFIX = "fitto:ai:req:";
    /** 저장값 = {@code jobId + SEP + payload}. 접수 중이면 jobId 자리가 비어 있다. */
    private static final String SEP = "\n";

    /**
     * 먼저 온 같은 요청 — {@code jobId} 가 null 이면 아직 접수 중(차감·제출 전)이다.
     *
     * @param payload 먼저 온 요청이 맡긴 값(우리 이모지는 원본 URL) — 두 번째 요청이 <b>자기가 올린 것</b>을
     *                치울지 가르는 데 쓴다. 같은 본문을 다시 보낸 것이면 그 파일은 먼저 온 작업의 것이다
     */
    public record RequestClaim(String jobId, String payload) {
        public boolean pending() {
            return jobId == null;
        }
    }

    /**
     * 같은 요청 키로 온 두 번째 요청인가 — <b>돈이 드는 접수</b>(우리 이모지)가 더블탭·네트워크 재시도로 두 번
     * 차감되지 않게 한다(docs/EMOJI_12_REGEN_2026-10-13.md §1-3).
     *
     * <p>비어 있으면 이 호출이 키를 <b>선점</b>했다 — 접수를 계속하고 {@link #bindRequest} 로 jobId 를 묶는다(실패하면
     * {@link #releaseRequest}). 값이 있으면 먼저 온 요청이다. 선점은 Redis {@code SET NX} 라 동시 도착에도 한 요청만
     * 이긴다. Redis 가 없으면 인메모리로 같은 일을 한다.
     */
    public java.util.Optional<RequestClaim> claimRequest(Long userId, String label, String requestId, String payload) {
        String key = requestKey(userId, label, requestId);
        String pendingValue = SEP + nullToEmpty(payload);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                Boolean claimed = redis.opsForValue().setIfAbsent(key, pendingValue, RETENTION);
                if (Boolean.TRUE.equals(claimed)) {
                    return java.util.Optional.empty();
                }
                return java.util.Optional.of(parseClaim(redis.opsForValue().get(key)));
            } catch (Exception e) {
                log.debug("Redis 미가용 — 요청 키 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            Entry entry = fallback.get(key);
            if (entry != null && entry.expiresAt().isAfter(Instant.now())) {
                return java.util.Optional.of(parseClaim(entry.json()));
            }
            fallback.put(key, new Entry(pendingValue, Instant.now().plus(RETENTION)));
            return java.util.Optional.empty();
        }
    }

    /** 선점한 요청 키에 접수된 jobId 를 묶는다 — 다음에 같은 키가 오면 이 jobId 를 돌려준다. */
    public void bindRequest(Long userId, String label, String requestId, String jobId, String payload) {
        putRequest(requestKey(userId, label, requestId), jobId + SEP + nullToEmpty(payload));
    }

    private static RequestClaim parseClaim(String stored) {
        if (stored == null) {
            return new RequestClaim(null, "");   // 방금 풀렸거나 만료 — 접수 중으로 보고 다시 누르게 한다
        }
        int at = stored.indexOf(SEP);
        String jobId = at < 0 ? stored : stored.substring(0, at);
        String payload = at < 0 ? "" : stored.substring(at + SEP.length());
        return new RequestClaim(jobId.isEmpty() ? null : jobId, payload);
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** 접수가 거절됐다(402·429·검증 실패) — 같은 키로 다시 시도할 수 있게 선점을 푼다. */
    public void releaseRequest(Long userId, String label, String requestId) {
        String key = requestKey(userId, label, requestId);
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.delete(key);
            } catch (Exception e) {
                log.debug("Redis 미가용 — 요청 키 해제 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            fallback.remove(key);
        }
    }

    private void putRequest(String key, String value) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForValue().set(key, value, RETENTION);
                return;
            } catch (Exception e) {
                log.debug("Redis 미가용 — 요청 키 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            fallback.put(key, new Entry(value, Instant.now().plus(RETENTION)));
        }
    }

    /** 사용자별로 나눈다 — 남이 같은 키를 보내도 내 작업이 돌아가지 않는다. */
    private static String requestKey(Long userId, String label, String requestId) {
        return REQUEST_KEY_PREFIX + label + ":" + userId + ":" + requestId;
    }

    /*
     * 실패 로그에 jobId·userId·소요 시간을 함께 남긴다 — 앱이 2분에 기다리기를 그만두는데, 서버에서
     * 작업이 얼마나 걸렸는지를 로그로 볼 수 없어 "앱이 먼저 포기했는가"를 가를 수 없었다.
     * 예상 못 한 예외는 스택트레이스(원인 사슬)까지 남긴다 — 예전엔 toString() 한 줄뿐이라,
     * 2026-10-05 "Error while extracting response … octet-stream" 7건의 진짜 원인(읽기 타임아웃)을
     * 스프링 바이트코드까지 내려가서야 알았다(docs/server-stability-current-state.md §11-2).
     */
    private void run(String jobId, Long userId, String label, Supplier<?> work) {
        long startedAt = System.currentTimeMillis();
        try {
            Object result = work.get();
            save(jobId, AiJob.pending(userId).done(objectMapper.writeValueAsString(result)));
            countFinished(label, "done");
        } catch (BusinessException e) {
            // 사용자에게 보여줄 말이 이미 정해진 실패 — 그대로 전달한다
            log.info("AI 작업 실패({}): {} — {} (job={}, userId={}, {}ms)", label, e.getErrorCode(),
                    e.getMessage(), jobId, userId, System.currentTimeMillis() - startedAt);
            save(jobId, AiJob.pending(userId).failed(e.getErrorCode().name(), e.getMessage()));
            countFinished(label, e.getErrorCode().name());
        } catch (Exception e) {
            log.warn("AI 작업 오류({}): {} (job={}, userId={}, {}ms)", label, e,
                    jobId, userId, System.currentTimeMillis() - startedAt, e);
            save(jobId, AiJob.pending(userId).failed(
                    ErrorCode.AI_ANALYSIS_FAILED.name(), ErrorCode.AI_ANALYSIS_FAILED.getMessage()));
            countFinished(label, "error");
        }
    }

    /**
     * 작업 상태 조회. <b>남의 작업은 없는 것으로 취급한다</b> — 존재 여부조차 알려주지 않는다.
     * (만료돼 사라진 것과 구분할 필요가 없고, 구분해주면 id 를 훑어볼 여지가 생긴다)
     */
    public AiJob poll(Long userId, String jobId) {
        AiJob job = read(jobId);
        if (job == null || !job.userId().equals(userId)) {
            throw new BusinessException(ErrorCode.AI_JOB_NOT_FOUND);
        }
        return job;
    }

    // ---- 저장소 ----

    private void save(String jobId, AiJob job) {
        String json;
        try {
            json = objectMapper.writeValueAsString(job);
        } catch (Exception e) {
            log.warn("AI 작업 직렬화 실패: {}", e.toString());
            return;
        }
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForValue().set(KEY_PREFIX + jobId, json, RETENTION);
                return;
            } catch (Exception e) {
                log.debug("Redis 미가용 — AI 작업 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            fallback.put(KEY_PREFIX + jobId, new Entry(json, Instant.now().plus(RETENTION)));
        }
    }

    private AiJob read(String jobId) {
        String json = null;
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                json = redis.opsForValue().get(KEY_PREFIX + jobId);
            } catch (Exception e) {
                log.debug("Redis 미가용 — AI 작업 조회 인메모리 폴백: {}", e.getMessage());
            }
        }
        if (json == null) {
            synchronized (fallback) {
                Entry entry = fallback.get(KEY_PREFIX + jobId);
                if (entry != null && entry.expiresAt().isAfter(Instant.now())) {
                    json = entry.json();
                }
            }
        }
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, AiJob.class);
        } catch (Exception e) {
            log.debug("AI 작업 역직렬화 실패 — 없는 것으로 본다: {}", e.toString());
            return null;
        }
    }

    @PreDestroy
    void shutdown() {
        executor.shutdownNow();
    }
}
