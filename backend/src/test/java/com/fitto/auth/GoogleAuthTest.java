package com.fitto.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.GoogleLoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UserResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.auth.service.GoogleTokenVerifier;
import com.fitto.auth.service.GoogleTokenVerifier.GoogleProfile;
import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 구글 로그인 (AUTH-11) — 토큰 검증은 GoogleTokenVerifier 의 책임이므로
 * 여기서는 검증된 프로필 이후의 계정 매칭·생성 규칙을 본다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class GoogleAuthTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired UserRepository userRepository;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

    /**
     * 회귀 방지: SecurityConfig 의 permitAll 목록에 /api/v1/auth/google 이 빠지면
     * 로그인 전인데도 401 이 나서 구글 로그인이 구조적으로 불가능해진다. 서비스 계층을
     * 직접 호출하는 아래 테스트들은 시큐리티 필터를 거치지 않아 이 결함을 못 잡으므로,
     * 여기서는 실제 HTTP 경유(MockMvc)로 Authorization 헤더 없이 호출해 검증한다.
     */
    @Test
    void 로그인_전_상태에서_구글_로그인_HTTP_요청이_401로_막히지_않는다() throws Exception {
        given(googleTokenVerifier.verify("token-http")).willReturn(
                new GoogleProfile("g-sub-http", "google-http@gmail.com", "구글러", null));

        mockMvc.perform(post("/api/v1/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new GoogleLoginRequest("token-http"))))
                .andExpect(status().isOk());
    }

    @Test
    void 처음_구글_로그인하면_계정이_생기고_재동의_게이트_대상이_된다() {
        given(googleTokenVerifier.verify("token-new")).willReturn(
                new GoogleProfile("g-sub-1", "google-new@gmail.com", "구글러", "https://img/p.jpg"));

        TokenResponse res = authService.googleLogin("token-new", IP);
        UserResponse user = res.user();

        assertThat(user.email()).isEqualTo("google-new@gmail.com");
        assertThat(user.name()).isEqualTo("구글러");
        // 소셜 가입은 가입 화면의 약관 체크박스를 거치지 않는다 — 재동의 게이트가 동의를 받는다
        assertThat(user.requiresConsent()).isTrue();

        User saved = userRepository.findById(user.id()).orElseThrow();
        assertThat(saved.getSocialType()).isEqualTo(SocialType.GOOGLE);
        assertThat(saved.getSocialId()).isEqualTo("g-sub-1");
        assertThat(saved.hasPassword()).isFalse();
    }

    @Test
    void 다시_로그인하면_새_계정을_만들지_않고_같은_계정으로_들어온다() {
        given(googleTokenVerifier.verify("token-again")).willReturn(
                new GoogleProfile("g-sub-2", "google-again@gmail.com", "재방문", null));

        Long first = authService.googleLogin("token-again", IP).user().id();
        Long second = authService.googleLogin("token-again", IP).user().id();

        assertThat(second).isEqualTo(first);
    }

    /** 이메일로 가입한 사람이 구글 로그인을 눌러도 계정이 갈라지면 안 된다. */
    @Test
    void 같은_이메일의_기존_계정이_있으면_그_계정으로_로그인된다() {
        Long existing = authService.register(new RegisterRequest(
                        "google-link@fitto.com", "password123", "기존회원", null, null, true, true, false), IP)
                .user().id();

        given(googleTokenVerifier.verify("token-link")).willReturn(
                new GoogleProfile("g-sub-3", "google-link@fitto.com", "구글이름", null));

        UserResponse viaGoogle = authService.googleLogin("token-link", IP).user();

        assertThat(viaGoogle.id()).isEqualTo(existing);
        // 기존 계정의 정보(이름·비밀번호)는 구글 프로필로 덮어쓰지 않는다
        assertThat(viaGoogle.name()).isEqualTo("기존회원");
        assertThat(userRepository.findById(existing).orElseThrow().hasPassword()).isTrue();
    }
}
