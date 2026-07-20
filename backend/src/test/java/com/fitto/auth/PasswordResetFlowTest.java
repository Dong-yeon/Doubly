package com.fitto.auth;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.auth.service.PasswordResetService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.mail.PasswordResetMailSender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.ActiveProfiles;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 비밀번호 재설정 플로우 검증 (AUTH-07 / AUTH-08) — H2 기반.
 * 발송 채널을 캡처 구현으로 바꿔 실제 발급된 코드를 확인한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PasswordResetFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;

    @Autowired
    PasswordResetService passwordResetService;

    @Autowired
    CapturingMailSender mailSender;

    /** 발송된 코드를 붙잡아두는 테스트용 채널. */
    static class CapturingMailSender implements PasswordResetMailSender {
        final List<String> codes = new ArrayList<>();

        @Override
        public void sendResetCode(String toEmail, String name, String code, Duration validFor) {
            codes.add(code);
        }

        String last() {
            return codes.get(codes.size() - 1);
        }
    }

    @TestConfiguration
    static class MailTestConfig {
        @Bean
        @Primary
        CapturingMailSender capturingMailSender() {
            return new CapturingMailSender();
        }
    }

    private String register(String email) {
        authService.register(new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP);
        return email;
    }

    @Test
    void 인증코드로_비밀번호를_재설정하면_새_비밀번호로_로그인된다() {
        String email = register("reset-ok@fitto.com");

        passwordResetService.sendResetCode(email, IP);
        passwordResetService.resetPassword(email, mailSender.last(), "newpassword456", IP);

        assertThatCode(() -> authService.login(new LoginRequest(email, "newpassword456"), IP))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> authService.login(new LoginRequest(email, "password123"), IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void 발급된_코드는_1회용이라_재사용할_수_없다() {
        String email = register("reset-once@fitto.com");

        passwordResetService.sendResetCode(email, IP);
        String code = mailSender.last();
        passwordResetService.resetPassword(email, code, "newpassword456", IP);

        assertThatThrownBy(() -> passwordResetService.resetPassword(email, code, "another789pw", IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_RESET_CODE);
    }

    @Test
    void 코드를_재발급하면_이전_코드는_무효화된다() {
        String email = register("reset-reissue@fitto.com");

        passwordResetService.sendResetCode(email, IP);
        String oldCode = mailSender.last();
        passwordResetService.sendResetCode(email, IP);
        String newCode = mailSender.last();

        assertThat(oldCode).isNotEqualTo(newCode);
        assertThatThrownBy(() -> passwordResetService.resetPassword(email, oldCode, "newpassword456", IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_RESET_CODE);
        assertThatCode(() -> passwordResetService.resetPassword(email, newCode, "newpassword456", IP))
                .doesNotThrowAnyException();
    }

    /**
     * 실패 카운트가 예외 롤백으로 사라지면 6자리 코드를 무한 대입할 수 있다.
     * 5회 실패 후에는 올바른 코드조차 거부되어야 카운트가 실제로 커밋된 것이다.
     */
    @Test
    void 코드를_5회_틀리면_올바른_코드도_거부된다() {
        String email = register("reset-bruteforce@fitto.com");

        passwordResetService.sendResetCode(email, IP);
        String correct = mailSender.last();
        String wrong = correct.equals("000000") ? "111111" : "000000";

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> passwordResetService.resetPassword(email, wrong, "newpassword456", IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.INVALID_RESET_CODE);
        }

        assertThatThrownBy(() -> passwordResetService.resetPassword(email, correct, "newpassword456", IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RESET_CODE_ATTEMPTS_EXCEEDED);
    }

    @Test
    void 미가입_이메일로_요청해도_예외없이_성공하고_코드는_발송되지_않는다() {
        int before = mailSender.codes.size();

        assertThatCode(() -> passwordResetService.sendResetCode("nobody@fitto.com", IP))
                .doesNotThrowAnyException();

        assertThat(mailSender.codes).hasSize(before); // 가입 여부가 응답으로 드러나지 않는다
    }

    @Test
    void 미가입_이메일_재설정은_코드오류와_같은_에러를_준다() {
        assertThatThrownBy(() ->
                passwordResetService.resetPassword("ghost@fitto.com", "123456", "newpassword456", IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_RESET_CODE);
    }

    @Test
    void 현재와_같은_비밀번호로는_재설정할_수_없다() {
        String email = register("reset-same@fitto.com");

        passwordResetService.sendResetCode(email, IP);

        assertThatThrownBy(() ->
                passwordResetService.resetPassword(email, mailSender.last(), "password123", IP))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.SAME_AS_CURRENT_PASSWORD);
    }

    /**
     * 코드 검증을 통과한 뒤 새 비밀번호만 잘못 고른 경우까지 실패로 세면,
     * 사용자가 옛 비밀번호를 몇 번 시도했다는 이유로 코드가 폐기되어 재발급을 강요당한다.
     */
    @Test
    void 같은_비밀번호_시도는_코드를_폐기하지_않는다() {
        String email = register("reset-same-retry@fitto.com");

        passwordResetService.sendResetCode(email, IP);
        String code = mailSender.last();

        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> passwordResetService.resetPassword(email, code, "password123", IP))
                    .isInstanceOf(BusinessException.class)
                    .extracting("errorCode").isEqualTo(ErrorCode.SAME_AS_CURRENT_PASSWORD);
        }

        // 같은 코드로 정상 재설정이 여전히 가능해야 한다
        assertThatCode(() -> passwordResetService.resetPassword(email, code, "newpassword456", IP))
                .doesNotThrowAnyException();
    }

    @Test
    void 비밀번호_변경은_현재_비밀번호가_맞아야_한다() {
        String email = register("change-pw@fitto.com");
        Long userId = authService.login(new LoginRequest(email, "password123"), IP).user().id();

        assertThatThrownBy(() -> passwordResetService.changePassword(userId, "wrongpass1", "newpassword456"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_CREDENTIALS);

        passwordResetService.changePassword(userId, "password123", "newpassword456");

        assertThatCode(() -> authService.login(new LoginRequest(email, "newpassword456"), IP))
                .doesNotThrowAnyException();
    }
}
