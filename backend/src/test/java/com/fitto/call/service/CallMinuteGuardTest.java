package com.fitto.call.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.PlanResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * 커플당 월 통화 시간 안전망 — Redis 없는(인메모리 폴백) 순수 단위 테스트.
 * 실제 통화를 15시간 넘게 쌓는 건 실시간이 걸려 {@code CallFlowTest}로는 검증할 수
 * 없으므로, {@link CallMinuteGuard#record}로 누적치를 직접 채워 넣고 확인한다.
 */
@ExtendWith(MockitoExtension.class)
class CallMinuteGuardTest {

    private static final Long COUPLE_ID = 1L;

    @Mock
    PlanResolver planResolver;
    @Mock
    ObjectProvider<StringRedisTemplate> redisProvider;

    CallMinuteGuard guard;

    @BeforeEach
    void setUp() {
        when(redisProvider.getIfAvailable()).thenReturn(null); // 인메모리 폴백 경로로만 검증
        guard = new CallMinuteGuard(planResolver, redisProvider);
    }

    @Test
    void 한도_안에서는_새_통화를_열_수_있다() {
        when(planResolver.resolveForRelation(COUPLE_ID)).thenReturn(Plan.FREE);

        assertThatCode(() -> guard.requireCapacity(COUPLE_ID)).doesNotThrowAnyException();
    }

    @Test
    void FREE_한도를_다_쓰면_새_통화를_못_연다() {
        when(planResolver.resolveForRelation(COUPLE_ID)).thenReturn(Plan.FREE);
        guard.record(COUPLE_ID, 15 * 60 * 60); // 정확히 15시간 소진

        assertThatThrownBy(() -> guard.requireCapacity(COUPLE_ID))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode())
                        .isEqualTo(ErrorCode.CALL_TIME_LIMIT_EXCEEDED));
    }

    @Test
    void record는_한도를_넘겨도_예외를_던지지_않는다() {
        // 이미 진행 중이던 통화는 끊지 않는다는 설계 — record() 자체엔 상한 체크가 없고,
        // 다음 requireCapacity() 호출부터(=다음 통화 시도부터) 막힌다.
        when(planResolver.resolveForRelation(COUPLE_ID)).thenReturn(Plan.FREE);

        assertThatCode(() -> guard.record(COUPLE_ID, 100 * 60 * 60)).doesNotThrowAnyException();
        assertThatThrownBy(() -> guard.requireCapacity(COUPLE_ID)).isInstanceOf(BusinessException.class);
    }

    @Test
    void PRO는_FREE보다_더_넉넉한_한도를_받는다() {
        when(planResolver.resolveForRelation(COUPLE_ID)).thenReturn(Plan.PRO);
        guard.record(COUPLE_ID, 20 * 60 * 60); // FREE 한도(15h)는 넘지만 PRO 한도(60h)는 안 넘음

        assertThatCode(() -> guard.requireCapacity(COUPLE_ID)).doesNotThrowAnyException();
    }

    @Test
    void 통화_시간이_0이하면_기록하지_않는다() {
        when(planResolver.resolveForRelation(COUPLE_ID)).thenReturn(Plan.FREE);

        guard.record(COUPLE_ID, 0);
        guard.record(COUPLE_ID, -5);

        assertThatCode(() -> guard.requireCapacity(COUPLE_ID)).doesNotThrowAnyException();
    }
}
