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
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

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
            new GeminiClient(properties, new ObjectMapper(), planGuard, usageCounter, new SimpleMeterRegistry());

    @BeforeEach
    void setUp() {
        properties.setApiKey("test-key");
        properties.setDailyLimitPerUser(10);
        properties.setDailyLimitTotal(1000);
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
        // 서비스 전체 카운터도 함께 오른다 — 이게 구글 프로젝트 쿼터를 지키는 축이다
        verify(usageCounter).incrementGlobal(eq(Feature.AI_TOTAL), any(Quota.class));
    }

    /*
     * 서비스 전체 한도는 개인 한도보다 <b>먼저</b> 본다. 순서가 반대면, 서비스가 이미 막혀
     * Gemini 를 한 번도 못 부를 요청이 개인 한도(월 1회 같은 희소한 것 포함)를 깎는다 —
     * 위 두 테스트가 지키는 것과 같은 원칙의 한 겹 위 버전이다.
     */
    @Test
    void 서비스_전체_한도에_걸리면_개인_한도는_건드리지_않는다() {
        properties.setDailyLimitTotal(1000);
        when(usageCounter.peekGlobal(eq(Feature.AI_TOTAL), any(Quota.class))).thenReturn(1000);

        assertThatThrownBy(() -> client.requireConfiguredAndCountUsage(1L, Feature.AI_DATE_COURSE))
                .isInstanceOf(BusinessException.class)
                // 개인 한도 소진과 다른 코드여야 한다 — 사용자 잘못이 아니라는 걸 앱이 구분해야 한다
                .extracting("errorCode").isEqualTo(ErrorCode.AI_SERVICE_LIMIT_EXCEEDED);

        verifyNoInteractions(planGuard);
        verify(usageCounter, never()).increment(any(), eq(Feature.AI_TOTAL), any());
        verify(usageCounter, never()).incrementGlobal(eq(Feature.AI_TOTAL), any());
    }

    /*
     * 호출이 실패하면 개인 한도(기능별 + 사용자 총량)는 되돌리고, 서비스 전체 총량은 두고 온다.
     * 이 비대칭이 핵심이다 — 되돌림이 남용 우회로가 되지 않는 이유가 여기 있다.
     * (실제 구글을 부르지 않으려고 baseUrl 을 닿지 않는 주소로 돌린다)
     */
    @Test
    void 호출이_실패하면_개인_한도만_되돌린다() {
        properties.setBaseUrl("http://127.0.0.1:1/v1beta/models");

        assertThatThrownBy(() -> client.generateJson(1L, Feature.AI_DATE_COURSE,
                List.of(GeminiClient.textPart("안녕")), Map.of("type", "OBJECT")))
                .isInstanceOf(BusinessException.class);

        verify(planGuard).refund(1L, Feature.AI_DATE_COURSE);
        verify(usageCounter).decrement(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class));
        /* 전역 카운터를 되돌리는 API 는 UsageCounter 에 아예 없다 — 구글이 이미 처리했을 수
         * 있으므로 되돌리면 안 되고, 없으면 실수로 되돌릴 수도 없다. */
    }
}
