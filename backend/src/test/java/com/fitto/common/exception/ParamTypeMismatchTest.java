package com.fitto.common.exception;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 쿼리 파라미터 타입이 안 맞는 요청은 <b>400</b>이어야 한다 — 500 이면 안 된다.
 *
 * <p>회귀 방지: 2026-09-15 에 사진첩 API 의 {@code sources} 를 enum 목록으로 받으면서
 * 드러났다. {@code ?sources=NOPE} 가 500 + 스택트레이스로 떨어졌는데, 서버가 잘못한 게
 * 아니라 요청이 잘못된 경우다 — 운영 로그(Railway)가 오염되고 클라이언트도 "재시도하면
 * 되는 오류"와 "요청을 고쳐야 하는 오류"를 구분할 수 없었다.
 *
 * <p>이 테스트가 지키는 건 특정 엔드포인트가 아니라 <b>전역 핸들러</b>다. 숫자·날짜 파라미터를
 * 받는 다른 API 도 같은 경로로 500 을 내고 있었다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class ParamTypeMismatchTest {

    @Autowired
    MockMvc mockMvc;
    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;

    private String bearerOf(String email) {
        return "Bearer " + authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").accessToken();
    }

    @Test
    void 잘못된_enum_값을_보내면_500_이_아니라_400_이다() throws Exception {
        mockMvc.perform(get("/api/v1/feed/photos?sources=NOPE")
                        .header("Authorization", bearerOf("mismatch-a@fitto.com")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("요청 값이 올바르지 않습니다: sources"));
    }

    @Test
    void 숫자_자리에_문자를_보내도_400_이다() throws Exception {
        mockMvc.perform(get("/api/v1/feed/photos?limit=abc")
                        .header("Authorization", bearerOf("mismatch-b@fitto.com")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.success").value(false));
    }

    /**
     * 정상 값은 그대로 200 — 핸들러를 붙이면서 멀쩡한 요청을 막지 않았는지 함께 본다.
     * 사진첩은 커플 스코프 API 라 <b>연결된 커플</b>이 있어야 200 이다(없으면 404).
     */
    @Test
    void 올바른_소스_목록은_200_이다() throws Exception {
        var me = authService.register(
                new RegisterRequest("mismatch-c@fitto.com", "password123", "테스터", null, null, true, true, false),
                "127.0.0.1");
        String auth = "Bearer " + me.accessToken();
        Long a = me.user().id();
        Long b = authService.register(
                new RegisterRequest("mismatch-d@fitto.com", "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        mockMvc.perform(get("/api/v1/feed/photos?sources=MEAL,WORKOUT").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }
}
