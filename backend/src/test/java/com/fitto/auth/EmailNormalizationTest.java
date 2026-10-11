package com.fitto.auth;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 이메일은 대소문자·앞뒤 공백과 무관하게 한 계정이다 (docs/first-experience-audit.md #12).
 * 예전엔 trim 만 해서 {@code A@x.com} 과 {@code a@x.com} 이 별개 계정이 됐다.
 */
@SpringBootTest
@ActiveProfiles("test")
class EmailNormalizationTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;

    private RegisterRequest register(String email) {
        return new RegisterRequest(email, "password123", "테스터", null, null, true, true, false);
    }

    @Test
    void 대문자로_가입해도_소문자로_저장되고_어떤_대소문자로든_로그인된다() {
        var res = authService.register(register("  Mixed.Case@Fitto.COM "), IP);
        assertThat(res.user().email()).isEqualTo("mixed.case@fitto.com");

        assertThatCode(() -> authService.login(new LoginRequest("MIXED.case@fitto.com", "password123"), IP))
                .doesNotThrowAnyException();
    }

    @Test
    void 대소문자만_다른_이메일로는_다시_가입할_수_없다() {
        authService.register(register("dup-case@fitto.com"), IP);

        assertThatThrownBy(() -> authService.register(register("Dup-Case@Fitto.com"), IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
    }
}
