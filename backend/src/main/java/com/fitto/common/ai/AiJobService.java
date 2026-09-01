package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
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
     */
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            2, 4, 60, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(100),
            r -> {
                Thread t = new Thread(r, "ai-job");
                t.setDaemon(true);
                return t;
            });

    public AiJobService(ObjectProvider<StringRedisTemplate> redisProvider, ObjectMapper objectMapper) {
        this.redisProvider = redisProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * 작업을 등록하고 <b>즉시</b> 작업 id 를 돌려준다. 실제 생성은 백그라운드에서 일어난다.
     *
     * @param work 결과를 만드는 일. 여기서 던진 {@link BusinessException} 은 그대로
     *             사용자에게 보여줄 메시지가 된다(한도 초과·AI 실패 등)
     */
    public String submit(Long userId, String label, Supplier<?> work) {
        String jobId = UUID.randomUUID().toString();
        save(jobId, AiJob.pending(userId));
        try {
            executor.execute(() -> run(jobId, userId, label, work));
        } catch (Exception rejected) {
            // 큐 포화 — PENDING 으로 남겨두면 사용자가 영원히 기다린다. 지금 실패로 못박는다.
            log.warn("AI 작업 큐 포화 — {} 거절 (userId={})", label, userId);
            save(jobId, AiJob.pending(userId).failed(
                    ErrorCode.AI_RATE_LIMITED.name(), ErrorCode.AI_RATE_LIMITED.getMessage()));
        }
        return jobId;
    }

    private void run(String jobId, Long userId, String label, Supplier<?> work) {
        try {
            Object result = work.get();
            save(jobId, AiJob.pending(userId).done(objectMapper.writeValueAsString(result)));
        } catch (BusinessException e) {
            // 사용자에게 보여줄 말이 이미 정해진 실패 — 그대로 전달한다
            log.info("AI 작업 실패({}): {} — {}", label, e.getErrorCode(), e.getMessage());
            save(jobId, AiJob.pending(userId).failed(e.getErrorCode().name(), e.getMessage()));
        } catch (Exception e) {
            log.warn("AI 작업 오류({}): {}", label, e.toString());
            save(jobId, AiJob.pending(userId).failed(
                    ErrorCode.AI_ANALYSIS_FAILED.name(), ErrorCode.AI_ANALYSIS_FAILED.getMessage()));
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
