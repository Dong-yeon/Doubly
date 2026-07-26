package com.fitto.auth;

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
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

/**
 * 구글 로그인 (AUTH-11) — 토큰 검증은 GoogleTokenVerifier 의 책임이므로
 * 여기서는 검증된 프로필 이후의 계정 매칭·생성 규칙을 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
class GoogleAuthTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired UserRepository userRepository;
    @MockitoBean GoogleTokenVerifier googleTokenVerifier;

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
