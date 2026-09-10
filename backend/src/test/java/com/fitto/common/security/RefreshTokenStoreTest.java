package com.fitto.common.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 리프레시 토큰 회전의 "응답 유실 vs 진짜 재사용" 판정 (2026-09-10).
 *
 * <p>갱신 응답이 클라이언트에 못 돌아가면 옛 토큰이 다시 온다. 이걸 무조건 재사용 공격으로 보면
 * 정상 사용자가 모든 기기에서 로그아웃된다(운영 로그 "재사용 감지 — 전체 세션 폐기"). 새 토큰이
 * 아직 안 쓰였을 때만 받아주고, 이미 쓰였으면 재사용으로 본다는 규칙을 여기서 고정한다.
 * Redis 없이 돌리기 위해 템플릿을 모킹한다 — 테스트 프로파일은 Redis 를 붙이지 않는다.
 */
@ExtendWith(MockitoExtension.class)
class RefreshTokenStoreTest {

    private static final Long USER = 7L;

    @Mock StringRedisTemplate redis;
    @Mock ValueOperations<String, String> values;
    @Mock SetOperations<String, String> sets;

    RefreshTokenStore store;

    @BeforeEach
    void setUp() {
        when(redis.opsForValue()).thenReturn(values);
        store = new RefreshTokenStore(redis);
    }

    @Test
    void 화이트리스트에_있는_토큰은_정상_소비된다() {
        when(redis.opsForSet()).thenReturn(sets);
        when(values.getAndDelete("auth:refresh:old")).thenReturn("7");

        assertThat(store.consume(USER, "old")).isEqualTo(RefreshTokenStore.ConsumeResult.VALID);
        verify(sets).remove("auth:sessions:7", "old");
    }

    /** 옛 토큰이 다시 왔는데 새 토큰이 아직 안 쓰였다 = 응답 유실. 새 토큰을 폐기하고 받아준다. */
    @Test
    void 후속_토큰이_안_쓰였으면_응답_유실로_보고_받아준다() {
        when(redis.opsForSet()).thenReturn(sets);
        when(values.getAndDelete("auth:refresh:old")).thenReturn(null);
        when(values.getAndDelete("auth:refresh:next:old")).thenReturn("new");
        when(values.getAndDelete("auth:refresh:new")).thenReturn("7");

        assertThat(store.consume(USER, "old")).isEqualTo(RefreshTokenStore.ConsumeResult.VALID);
        // 클라이언트가 못 받은 새 토큰은 세션 목록에서도 빠져야 한다 — 남으면 유령 세션
        verify(sets).remove("auth:sessions:7", "new");
    }

    /** 옛 토큰이 다시 왔는데 새 토큰이 이미 쓰였다 = 두 주체가 한 계보를 나눠 쓴다. 재사용이다. */
    @Test
    void 후속_토큰이_이미_쓰였으면_재사용이다() {
        when(values.getAndDelete("auth:refresh:old")).thenReturn(null);
        when(values.getAndDelete("auth:refresh:next:old")).thenReturn("new");
        when(values.getAndDelete("auth:refresh:new")).thenReturn(null);

        assertThat(store.consume(USER, "old")).isEqualTo(RefreshTokenStore.ConsumeResult.REUSED);
    }

    /** 계보 기록이 없는 토큰(로그아웃·전체 폐기·회전 이전) — 복구 대상이 아니다. */
    @Test
    void 계보가_없으면_재사용이다() {
        when(values.getAndDelete("auth:refresh:old")).thenReturn(null);
        when(values.getAndDelete("auth:refresh:next:old")).thenReturn(null);

        assertThat(store.consume(USER, "old")).isEqualTo(RefreshTokenStore.ConsumeResult.REUSED);
        verify(values, never()).getAndDelete("auth:refresh:new");
    }

    /** 다른 사용자의 토큰을 계보로 엮어 넣어도 통과하지 않는다. */
    @Test
    void 후속_토큰_주인이_다르면_재사용이다() {
        when(values.getAndDelete("auth:refresh:old")).thenReturn(null);
        when(values.getAndDelete("auth:refresh:next:old")).thenReturn("new");
        when(values.getAndDelete("auth:refresh:new")).thenReturn("99");

        assertThat(store.consume(USER, "old")).isEqualTo(RefreshTokenStore.ConsumeResult.REUSED);
    }

    @Test
    void 회전_계보는_리프레시_토큰과_같은_수명으로_기록된다() {
        store.markRotated("old", "new", Duration.ofDays(14));

        verify(values).set("auth:refresh:next:old", "new", Duration.ofDays(14));
        verify(values, never()).getAndDelete(anyString());
    }
}
