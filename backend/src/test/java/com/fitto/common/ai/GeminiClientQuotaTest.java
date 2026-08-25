package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.Quota;
import com.fitto.common.plan.UsageCounter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@code GeminiClient.requireConfiguredAndCountUsage} 의 확인(peek)/커밋(increment) 순서 —
 * 스프링 컨텍스트 없는 순수 단위 테스트 (PlanGuard/UsageCounter 모킹).
 * <p>
 * 회귀 방지: 예전엔 기능별 한도(consume)를 먼저 커밋하고 총량(AI_TOTAL) 안전망을 나중에 확인했다.
 * 총량에 막히면 — Gemini 를 한 번도 못 부르고도 — 이미 커밋된 기능별 한도(월 1회 등 희소한 한도
 * 포함)가 낭비됐다. 지금은 총량을 먼저 peek(부작용 없음)해 막히면 기능별 한도를 아예 건드리지 않는다.
 */
class GeminiClientQuotaTest {

    private final PlanGuard planGuard = mock(PlanGuard.class);
    private final UsageCounter usageCounter = mock(UsageCounter.class);
    private final GeminiProperties properties = new GeminiProperties();
    private final GeminiClient client =
            new GeminiClient(properties, new ObjectMapper(), planGuard, usageCounter);

    @BeforeEach
    void setUp() {
        properties.setApiKey("test-key");
        properties.setDailyLimitPerUser(10);
    }

    @Test
    void 총량이_이미_다_찼으면_기능별_한도는_건드리지_않는다() {
        when(usageCounter.peek(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class))).thenReturn(10);

        assertThatThrownBy(() -> client.requireConfiguredAndCountUsage(1L, Feature.AI_DATE_COURSE))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_DAILY_LIMIT_EXCEEDED);

        // 월 1회 같은 희소한 기능 한도가 낭비되지 않아야 한다 — consume() 이 아예 호출되지 않는다
        verifyNoInteractions(planGuard);
        verify(usageCounter, never()).increment(any(), eq(Feature.AI_TOTAL), any());
    }

    @Test
    void 기능이_막히면_총량은_커밋되지_않는다() {
        when(usageCounter.peek(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class))).thenReturn(0);
        org.mockito.Mockito.doThrow(new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED, "한도 초과"))
                .when(planGuard).consume(1L, Feature.AI_DATE_COURSE);

        assertThatThrownBy(() -> client.requireConfiguredAndCountUsage(1L, Feature.AI_DATE_COURSE))
                .isInstanceOf(BusinessException.class);

        // 무료에서 막힌 기능이 총량 카운터를 갉아먹지 않아야 한다
        verify(usageCounter, never()).increment(any(), eq(Feature.AI_TOTAL), any());
    }

    @Test
    void 둘_다_여유있으면_기능과_총량_모두_커밋된다() {
        when(usageCounter.peek(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class))).thenReturn(0);
        when(usageCounter.increment(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class))).thenReturn(1);

        client.requireConfiguredAndCountUsage(1L, Feature.AI_DATE_COURSE);

        verify(planGuard).consume(1L, Feature.AI_DATE_COURSE);
        verify(usageCounter).increment(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class));
    }
}
