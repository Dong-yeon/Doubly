package com.fitto.auth;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.notification.service.DeviceTokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 로그아웃하면 그 기기로 알림이 더 가지 않는가.
 *
 * <p>예전 로그아웃은 리프레시 토큰만 폐기하고 {@code device_tokens} 는 그대로 두었다. 그래서 로그아웃한
 * 폰에 그 계정의 채팅·상대 활동 알림이 미리보기 본문째로 계속 왔다(docs/my-current-state.md §7-4).
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class LogoutPushTokenTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;
    @Autowired
    DeviceTokenService deviceTokenService;
    @Autowired
    DeviceTokenRepository deviceTokenRepository;

    private TokenResponse register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP);
    }

    private boolean hasToken(Long userId, String token) {
        return deviceTokenRepository.findByUserId(userId).stream()
                .map(DeviceToken::getToken)
                .anyMatch(token::equals);
    }

    @Test
    void 로그아웃에_푸시_토큰을_주면_그_기기_토큰만_지운다() {
        TokenResponse me = register("logout-push-me@fitto.com");
        Long userId = me.user().id();
        deviceTokenService.register(userId, "ExponentPushToken[phone]", "android");
        deviceTokenService.register(userId, "ExponentPushToken[tablet]", "ios");

        authService.logout(me.refreshToken(), "ExponentPushToken[phone]");

        assertThat(hasToken(userId, "ExponentPushToken[phone]")).isFalse();
        // 다른 기기는 여전히 로그인 상태다 — 거기 알림까지 끊으면 안 된다
        assertThat(hasToken(userId, "ExponentPushToken[tablet]")).isTrue();
    }

    @Test
    void 남의_토큰은_내_리프레시_토큰으로_지울_수_없다() {
        TokenResponse me = register("logout-push-attacker@fitto.com");
        TokenResponse other = register("logout-push-victim@fitto.com");
        deviceTokenService.register(other.user().id(), "ExponentPushToken[victim]", "android");

        authService.logout(me.refreshToken(), "ExponentPushToken[victim]");

        assertThat(hasToken(other.user().id(), "ExponentPushToken[victim]")).isTrue();
    }

    @Test
    void 푸시_토큰_없이_로그아웃하면_토큰은_그대로다() {
        // 옛 앱은 본문 없이 부른다 — 지금까지와 같은 동작이어야 한다
        TokenResponse me = register("logout-push-legacy@fitto.com");
        Long userId = me.user().id();
        deviceTokenService.register(userId, "ExponentPushToken[legacy]", "android");

        authService.logout(me.refreshToken(), null);

        assertThat(hasToken(userId, "ExponentPushToken[legacy]")).isTrue();
    }
}
