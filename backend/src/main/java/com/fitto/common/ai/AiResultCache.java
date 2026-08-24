package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.plan.Feature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * AI 생성 결과 캐시 — 같은 입력에는 같은 답을 돌려주고 Gemini 를 다시 부르지 않는다.
 *
 * <p><b>왜 필요한가</b>: 주간 레터·데이트 코스·식단 코치·맛집 추천은 화면에 들어갈 때마다
 * 새로 생성했다. 그런데 이것들의 재료(지난주 결산, 저장한 장소, 최근 7일 식단)는 하루에도
 * 몇 번씩 바뀌는 값이 아니다. 결국 <b>같은 입력으로 같은 답을 몇 초씩 기다려 다시 만드는</b>
 * 셈이라, 두 번째 방문부터는 순수한 대기 시간이고 Gemini 쿼터만 갉아먹는다.
 *
 * <p><b>키는 시간이 아니라 입력이다.</b> "하루 캐시" 같은 TTL 방식은 두 방향으로 다 틀린다 —
 * 식단을 새로 적었는데도 어제 코칭을 보여주거나(너무 김), 아무것도 안 바뀌었는데 자정에
 * 다시 부른다(너무 짧음). 그래서 <b>AI 에 보내는 입력 문자열의 해시</b>를 키에 넣는다.
 * 재료가 그대로면 자동으로 맞고, 한 글자라도 달라지면 자동으로 빗나가 다시 생성한다.
 * TTL 은 판정이 아니라 청소용이다.
 *
 * <p>온도(temperature 0.2)가 0 이 아니라서 같은 입력에도 표현은 조금씩 달라진다. "다른 답이
 * 보고 싶다"는 요구는 캐시 만료가 아니라 {@code refresh=true}(사용자가 누르는 새로고침)로
 * 받는다 — 언제 바뀔지 모르는 것보다 누르면 바뀌는 쪽이 예측 가능하다.
 *
 * <p>저장소는 {@link com.fitto.common.plan.UsageCounter} 와 같은 구성이다. Redis 가 기본이라
 * 재배포·다중 인스턴스에서도 남고, 없으면(로컬 개발·테스트) 인메모리로 폴백한다.
 */
@Component
public class AiResultCache {

    private static final Logger log = LoggerFactory.getLogger(AiResultCache.class);

    private static final String KEY_PREFIX = "fitto:ai:result:";

    /**
     * 보관 기간 — <b>유효성 판정이 아니라 청소</b>다. 입력이 바뀌면 키가 달라져 알아서
     * 빗나가므로, 여기 값은 "아무도 다시 안 볼 항목을 언제 버릴까"만 정한다.
     */
    private static final Duration RETENTION = Duration.ofDays(7);

    /** Redis 미가용 시 폴백의 최대 항목 수 — 개발 환경 전용이라 넉넉하지 않아도 된다. */
    private static final int FALLBACK_MAX_ENTRIES = 200;

    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final ObjectMapper objectMapper;

    /** 폴백 저장소. 가장 오래된 것부터 밀어내 무한 증가를 막는다. */
    private final Map<String, Entry> fallback = new LinkedHashMap<>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Entry> eldest) {
            return size() > FALLBACK_MAX_ENTRIES;
        }
    };

    private record Entry(String json, Instant expiresAt) {
    }

    public AiResultCache(ObjectProvider<StringRedisTemplate> redisProvider, ObjectMapper objectMapper) {
        this.redisProvider = redisProvider;
        this.objectMapper = objectMapper;
    }

    /**
     * 캐시에 있으면 그대로, 없으면 {@code generator} 를 돌려 만들고 저장한다.
     *
     * <p><b>캐시가 맞으면 {@code generator} 는 아예 실행되지 않는다</b> — 플랜 한도 차감도
     * 그 안에 있으므로 같이 건너뛴다. 의도한 동작이다. 이미 정당하게 생성해 받은 결과를 다시
     * 보는 것뿐이라 새로 파는 것이 아니고, 화면에 다시 들어갔다는 이유로 남은 횟수가 줄면
     * 사용자는 무엇 때문에 줄었는지 알 수 없다.
     *
     * @param input   AI 에 보낼 입력(프롬프트에 채워 넣는 재료). 이 값이 캐시의 신원이다
     * @param refresh 사용자가 명시적으로 새로 만들라고 했는가 — 캐시를 건너뛰고 덮어쓴다
     */
    public <T> T remember(Long userId, Feature feature, String input, boolean refresh,
                          Class<T> type, Supplier<T> generator) {
        String key = key(userId, feature, input);

        if (!refresh) {
            T cached = read(key, type);
            if (cached != null) {
                return cached;
            }
        }

        T generated = generator.get();
        // 생성 실패는 예외로 그대로 올라간다 — 성공한 결과만 저장한다
        write(key, generated);
        return generated;
    }

    /** 같은 사용자·같은 기능·같은 입력이면 같은 키. */
    private String key(Long userId, Feature feature, String input) {
        return KEY_PREFIX + feature.name() + ":" + userId + ":" + fingerprint(input);
    }

    /**
     * 입력의 지문. 프롬프트 재료는 수 KB 까지 커질 수 있어 그대로 키에 넣지 않는다.
     * 충돌은 실질적으로 불가능하고, 설령 나도 같은 사용자·같은 기능 안에서만 유효하다.
     */
    private static String fingerprint(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash, 0, 12);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 은 모든 JVM 이 반드시 제공한다(JLS 보장) — 여기 오면 환경이 깨진 것이다
            throw new IllegalStateException("SHA-256 미지원", e);
        }
    }

    private <T> T read(String key, Class<T> type) {
        String json = readJson(key);
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            // 배포로 DTO 모양이 바뀌면 예전 캐시는 못 읽는다 — 실패가 아니라 미스로 취급해
            // 새로 생성한다. 여기서 던지면 배포 직후 사용자에게 500 이 나간다.
            log.debug("AI 캐시 역직렬화 실패 — 새로 생성한다: key={} type={}", key, type.getSimpleName());
            return null;
        }
    }

    private String readJson(String key) {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                return redis.opsForValue().get(key);
            } catch (Exception e) {
                log.debug("Redis 미가용 — AI 캐시 조회 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            Entry entry = fallback.get(key);
            if (entry == null) {
                return null;
            }
            if (entry.expiresAt().isBefore(Instant.now())) {
                fallback.remove(key);
                return null;
            }
            return entry.json();
        }
    }

    private void write(String key, Object value) {
        String json;
        try {
            json = objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            // 캐시에 못 넣는 것뿐이다 — 결과는 이미 만들어졌으므로 호출부는 그대로 진행한다
            log.warn("AI 캐시 직렬화 실패 — 저장을 건너뛴다: key={}", key, e);
            return;
        }

        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis != null) {
            try {
                redis.opsForValue().set(key, json, RETENTION);
                return;
            } catch (Exception e) {
                log.debug("Redis 미가용 — AI 캐시 저장 인메모리 폴백: {}", e.getMessage());
            }
        }
        synchronized (fallback) {
            fallback.put(key, new Entry(json, Instant.now().plus(RETENTION)));
        }
    }
}
