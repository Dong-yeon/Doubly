package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.GeminiProperties;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.plan.Quota;
import com.fitto.common.plan.UsageCounter;
import com.sun.net.httpserver.HttpServer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 크레딧으로 연 작업의 텍스트 단계가 실패하면 <b>크레딧으로</b> 되돌린다(docs/EMOJI_12_REGEN_2026-10-13.md §2-5).
 *
 * <p>회귀 방지: 우리 이모지의 외형 추출은 쿼터 경로({@code planGuard.refund(userId, feature)})로만 되돌렸다. FREE 가
 * 산 크레딧으로 연 회차면 그 경로는 "센 적 없음"으로 지나가 크레딧이 그대로 사라졌다.
 *
 * <p>구글 대신 400 을 돌려주는 로컬 서버를 쓴다 — 400 은 재시도하지 않으므로 백그라운드 재시도 예산(4분)을 타지 않는다.
 */
class GeminiChargeRefundTest {

    private final PlanGuard planGuard = mock(PlanGuard.class);
    private final UsageCounter usageCounter = mock(UsageCounter.class);
    private final GeminiProperties properties = new GeminiProperties();
    private HttpServer server;
    private GeminiClient client;

    @BeforeEach
    void setUp() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            byte[] body = "{\"error\":{\"code\":400}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        properties.setApiKey("test-key");
        properties.setDailyLimitPerUser(50);
        properties.setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/models");
        client = new GeminiClient(properties, new ObjectMapper(), planGuard, usageCounter,
                new SimpleMeterRegistry(), mock(AiUsageRecorder.class));
    }

    @AfterEach
    void tearDown() {
        server.stop(0);
    }

    @Test
    void 크레딧으로_연_작업의_텍스트_단계가_실패하면_크레딧으로_되돌린다() {
        assertThatThrownBy(() -> client.generateJsonInBackground(1L, Feature.AI_COUPLE_EMOJI,
                List.of(GeminiClient.textPart("외형")), Map.of("type", "OBJECT"), PlanGuard.Charge.CREDIT))
                .isInstanceOf(BusinessException.class);

        verify(planGuard).refund(1L, Feature.AI_COUPLE_EMOJI, PlanGuard.Charge.CREDIT);
        // 쿼터 경로로는 되돌리지 않는다 — 두 경로로 되돌리면 크레딧과 쿼터가 함께 돌아온다
        verify(planGuard, never()).refund(1L, Feature.AI_COUPLE_EMOJI);
        verify(usageCounter).decrement(eq(1L), eq(Feature.AI_TOTAL), any(Quota.class));
    }
}
