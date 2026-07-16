package com.fitto.common.security;

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
 * 인증/인가 실패 응답 — 필터 단계라 서비스 테스트로는 잡히지 않아 MockMvc 로 검증한다.
 * <p>
 * 회귀 방지: authenticationEntryPoint 를 설정하지 않으면 스프링 기본값이 <b>본문 없는 403</b>을
 * 주고, 그러면 (1) 클라이언트가 만료를 401 로 인식 못 해 리프레시 토큰이 멀쩡한데도 자동 갱신을
 * 못 하고 (2) 본문이 없어 사용자에게 axios 원문(영문)이 노출된다. 실제로 30분 뒤 앱이
 * 조용히 망가지는 버그로 나타났다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityErrorResponseTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void 토큰_없이_보호된_API_를_부르면_401_과_한국어_메시지가_온다() throws Exception {
        mockMvc.perform(get("/api/v1/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errorCode").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").value("인증이 필요합니다."));
    }

    @Test
    void 만료되거나_잘못된_토큰도_403_이_아니라_401_이다() throws Exception {
        // 클라이언트 인터셉터가 401 에서만 자동 갱신하므로 403 이면 안 된다
        mockMvc.perform(get("/api/v1/places").header("Authorization", "Bearer not.a.valid.token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("UNAUTHORIZED"));
    }

    @Test
    void 인증실패_응답에도_본문이_있다() throws Exception {
        // 본문이 비면 프론트가 axios 원문("Request failed with status code 403")을 노출한다
        mockMvc.perform(get("/api/v1/trips"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    @Test
    void 공개_엔드포인트는_인증없이_통과한다() throws Exception {
        mockMvc.perform(get("/api/v1/health")).andExpect(status().isOk());
    }
}
