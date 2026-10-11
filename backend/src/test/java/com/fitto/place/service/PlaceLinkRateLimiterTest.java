package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PlaceLinkRateLimiterTest {

    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> ops = mock(ValueOperations.class);
    private final StringRedisTemplate redis = mock(StringRedisTemplate.class);

    @Test
    void 창_안에서_20회까지는_허용하고_21회째_429() {
        when(redis.opsForValue()).thenReturn(ops);
        PlaceLinkRateLimiter limiter = new PlaceLinkRateLimiter(redis);

        when(ops.increment("rl:place-link:7")).thenReturn(1L);
        assertThatCode(() -> limiter.check(7L)).doesNotThrowAnyException();
        // 첫 증가에서만 창(10분)을 건다
        verify(redis).expire("rl:place-link:7", PlaceLinkRateLimiter.WINDOW);

        when(ops.increment("rl:place-link:7")).thenReturn(20L);
        assertThatCode(() -> limiter.check(7L)).doesNotThrowAnyException();

        when(ops.increment("rl:place-link:7")).thenReturn(21L);
        assertThatThrownBy(() -> limiter.check(7L)).isInstanceOf(BusinessException.class);
    }

    @Test
    void Redis가_죽으면_허용한다() {
        when(redis.opsForValue()).thenReturn(ops);
        when(ops.increment("rl:place-link:7")).thenThrow(new RedisConnectionFailureException("down"));

        assertThatCode(() -> new PlaceLinkRateLimiter(redis).check(7L)).doesNotThrowAnyException();
    }
}
