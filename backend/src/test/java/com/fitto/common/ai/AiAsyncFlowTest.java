package com.fitto.common.ai;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.security.JwtTokenProvider;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AI 비동기 흐름을 <b>HTTP 경로 그대로</b> 검증한다 — 접수(202) → 폴링 → 결과/실패.
 *
 * <p>서비스 단위 테스트로는 컨트롤러 매핑·상태코드·응답 모양·인가가 안 잡힌다. 특히 이번에
 * GET 이던 엔드포인트 셋을 POST 로 바꿨는데, 그런 변경은 앱을 켜보기 전엔 드러나지 않는다.
 *
 * <p>테스트 프로파일엔 Gemini 키가 없어 작업은 {@code AI_NOT_CONFIGURED} 로 <b>실패</b>한다.
 * 그래도 검증 가치는 그대로다 — 확인하려는 건 "AI 가 좋은 답을 주는가"가 아니라
 * <b>접수증이 오고, 폴링으로 결과가 전달되고, 실패 이유가 사용자 문구로 도착하는가</b>이기 때문이다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AiAsyncFlowTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    AuthService authService;
    @Autowired
    JwtTokenProvider tokenProvider;
    @Autowired
    ObjectMapper objectMapper;

    private String bearerOf(String email) {
        return "Bearer " + authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").accessToken();
    }

    /** 접수증(202)을 받아 jobId 를 꺼낸다. */
    private String startJob(String auth, String path) throws Exception {
        return startJob(auth, path, "{}");
    }

    private String startJob(String auth, String path, String body) throws Exception {
        MvcResult result = mockMvc.perform(post(path).header("Authorization", auth)
                        .contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.data.jobId").isNotEmpty())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .path("data").path("jobId").asText();
    }

    /** PENDING 을 벗어날 때까지 폴링한다 — 앱이 하는 것과 같은 방식이다. */
    private JsonNode pollUntilSettled(String auth, String jobId) throws Exception {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(10));
        while (Instant.now().isBefore(deadline)) {
            MvcResult result = mockMvc.perform(get("/api/v1/ai/jobs/" + jobId).header("Authorization", auth))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode data = objectMapper.readTree(result.getResponse().getContentAsString()).path("data");
            if (!"PENDING".equals(data.path("status").asText())) {
                return data;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("작업이 PENDING 에서 벗어나지 못했다");
    }

    /*
     * 여섯 경로 전부를 같은 방식으로 훑는다. 하나라도 매핑(GET->POST)이나 202 를 빠뜨리면
     * 여기서 걸린다 — 앱에서는 "AI 버튼이 안 먹네"로만 보일 종류의 실수다.
     */
    @Test
    void 모든_AI_엔드포인트가_접수증을_주고_폴링으로_결과가_온다() throws Exception {
        String auth = bearerOf("aiflow1@fitto.com");
        // 경로별 최소 유효 본문 — 본문이 필요 없는 것들은 "{}"
        String[][] cases = {
                {"/api/v1/meal/analyze-text", "{\"text\":\"계란 2개\"}"},
                {"/api/v1/meal/coach", "{}"},
                {"/api/v1/summary/ai-letter", "{}"},
                {"/api/v1/places/date-course", "{}"},
                {"/api/v1/places/lovelichelin/recommendations", "{}"},
                {"/api/v1/workout/recommend", "{\"days\":1}"},
        };
        for (String[] c : cases) {
            String path = c[0];
            String jobId = startJob(auth, path, c[1]);
            JsonNode settled = pollUntilSettled(auth, jobId);
            // 키가 없으니 성공은 아니지만, 상태가 확정되고 문구가 실려 오는 것이 핵심이다
            assertThat(settled.path("status").asText())
                    .as("%s 의 작업 상태", path)
                    .isIn("DONE", "FAILED");
            if ("FAILED".equals(settled.path("status").asText())) {
                assertThat(settled.path("message").asText()).as("%s 의 실패 문구", path).isNotBlank();
            }
        }
    }

    @Test
    void 남의_작업은_폴링할_수_없다() throws Exception {
        String owner = bearerOf("aiflow2@fitto.com");
        String stranger = bearerOf("aiflow3@fitto.com");
        String jobId = startJob(owner, "/api/v1/meal/coach");

        mockMvc.perform(get("/api/v1/ai/jobs/" + jobId).header("Authorization", stranger))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("AI_JOB_NOT_FOUND"));
    }

    @Test
    void 토큰_없이는_작업을_시작할_수도_폴링할_수도_없다() throws Exception {
        mockMvc.perform(post("/api/v1/meal/coach").contentType(APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/ai/jobs/아무거나"))
                .andExpect(status().isUnauthorized());
    }

    /*
     * 지표는 서비스 내부 사정이라 일반 사용자에게 열리면 안 된다. 반대로 완전히 막으면
     * 정작 볼 사람이 못 본다 — 그래서 ADMIN 게이트이고, 그 경계를 여기서 고정한다.
     */
    @Test
    void 액추에이터는_ADMIN_에게만_열린다() throws Exception {
        mockMvc.perform(get("/actuator/health")).andExpect(status().isUnauthorized());

        String user = bearerOf("aiflow4@fitto.com");
        mockMvc.perform(get("/actuator/health").header("Authorization", user))
                .andExpect(status().isForbidden());

        String admin = "Bearer " + tokenProvider.createAccessToken(999_999L, Role.ADMIN);
        mockMvc.perform(get("/actuator/health").header("Authorization", admin))
                .andExpect(status().isOk())
                /*
                 * UP 이어야 한다. 처음 붙였을 때 DOWN 이 나왔는데 원인은 SMTP 헬스 인디케이터였다 —
                 * 운영은 Resend(HTTP)로 보내고 Railway 는 SMTP 를 막아서 <b>영영 DOWN</b> 인 값이
                 * 전체 판정을 끌어내리고 있었다. 그 상태였다면 지표를 붙여놓고도 못 썼을 것이다.
                 */
                .andExpect(jsonPath("$.status").value("UP"))
                .andExpect(jsonPath("$.components.db.status").value("UP"));
    }

    /*
     * 지표가 "등록만 되고 값이 안 붙는" 상태를 막는다. 커넥션 풀은 이번에 실제로 말랐던
     * 지점이고, AI 작업 대기열은 사용자가 체감하기 전에 뜨는 가장 이른 신호다.
     */
    @Test
    void 커넥션풀과_AI작업_지표가_실제로_노출된다() throws Exception {
        String admin = "Bearer " + tokenProvider.createAccessToken(999_998L, Role.ADMIN);

        mockMvc.perform(get("/actuator/metrics/hikaricp.connections.active").header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements").isNotEmpty());

        mockMvc.perform(get("/actuator/metrics/fitto.ai.job.queued").header("Authorization", admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.measurements").isNotEmpty());
    }
}
