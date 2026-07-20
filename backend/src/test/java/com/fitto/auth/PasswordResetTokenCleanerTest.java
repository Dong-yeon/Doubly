package com.fitto.auth;

import com.fitto.auth.domain.PasswordResetToken;
import com.fitto.auth.repository.PasswordResetTokenRepository;
import com.fitto.auth.service.PasswordResetTokenCleaner;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 만료 재설정 코드 정리 (AUTH-07).
 *
 * <p>정리 스케줄러가 없던 시절에는 password_reset_tokens 가 무한정 쌓였다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PasswordResetTokenCleanerTest {

    @Autowired AuthService authService;
    @Autowired PasswordResetTokenRepository tokenRepository;
    @Autowired PasswordResetTokenCleaner cleaner;

    private Long registerUser(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                        "127.0.0.1")
                .user().id();
    }

    private void saveToken(Long userId, LocalDateTime expiresAt) {
        tokenRepository.save(PasswordResetToken.builder()
                .userId(userId)
                .codeHash("dummy-hash")
                .expiresAt(expiresAt)
                .build());
    }

    @Test
    void 만료된_코드만_지우고_유효한_코드는_남긴다() {
        Long userId = registerUser("cleaner@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        saveToken(userId, now.minusHours(2));   // 만료
        saveToken(userId, now.minusMinutes(1)); // 만료
        saveToken(userId, now.plusMinutes(30)); // 유효

        cleaner.purgeExpired();

        assertThat(tokenRepository.findUnusedByUser(userId)).hasSize(1);
    }

    @Test
    void 지울_것이_없어도_예외없이_동작한다() {
        Long userId = registerUser("cleaner-empty@fitto.com");
        saveToken(userId, LocalDateTime.now().plusMinutes(30));

        cleaner.purgeExpired();

        assertThat(tokenRepository.findUnusedByUser(userId)).hasSize(1);
    }
}
