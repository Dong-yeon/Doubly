package com.fitto.notification.service;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.http.HttpStatus;

import java.net.ConnectException;
import java.net.SocketTimeoutException;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 푸시 토큰 정리(V128)와 발송 재시도 판정 (docs/first-experience-audit.md #27·#28).
 */
@SpringBootTest
@ActiveProfiles("test")
class DeviceTokenPruneTest {

    @Autowired AuthService authService;
    @Autowired DeviceTokenService deviceTokenService;
    @Autowired DeviceTokenRepository deviceTokenRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    private java.util.List<String> tokensOf(Long userId) {
        return deviceTokenRepository.findByUserId(userId).stream().map(DeviceToken::getToken).toList();
    }

    @Test
    void 사용자당_최근_등록된_토큰만_남는다() throws Exception {
        Long user = register("token-prune@fitto.com");
        for (int i = 1; i <= DeviceTokenService.MAX_TOKENS_PER_USER + 2; i++) {
            deviceTokenService.register(user, "ExponentPushToken[prune-" + i + "]", "android");
            Thread.sleep(5); // 등록 시각이 겹치지 않게
        }

        assertThat(tokensOf(user))
                .hasSize(DeviceTokenService.MAX_TOKENS_PER_USER)
                .doesNotContain("ExponentPushToken[prune-1]", "ExponentPushToken[prune-2]");
    }

    @Test
    void 다시_등록한_토큰은_최근으로_올라가_살아남는다() throws Exception {
        Long user = register("token-refresh@fitto.com");
        deviceTokenService.register(user, "ExponentPushToken[old-phone]", "android");
        for (int i = 1; i < DeviceTokenService.MAX_TOKENS_PER_USER; i++) {
            Thread.sleep(5);
            deviceTokenService.register(user, "ExponentPushToken[refresh-" + i + "]", "android");
        }
        Thread.sleep(5);
        deviceTokenService.register(user, "ExponentPushToken[old-phone]", "android"); // 그 폰에서 앱을 다시 켰다
        Thread.sleep(5);
        deviceTokenService.register(user, "ExponentPushToken[new-phone]", "android");

        assertThat(tokensOf(user))
                .hasSize(DeviceTokenService.MAX_TOKENS_PER_USER)
                .contains("ExponentPushToken[old-phone]", "ExponentPushToken[new-phone]")
                .doesNotContain("ExponentPushToken[refresh-1]");
    }

    @Test
    void 같은_기기에_다른_계정이_로그인하면_토큰_주인이_바뀐다() {
        Long first = register("token-owner-a@fitto.com");
        Long second = register("token-owner-b@fitto.com");
        deviceTokenService.register(first, "ExponentPushToken[shared-device]", "ios");
        deviceTokenService.register(second, "ExponentPushToken[shared-device]", "ios");

        assertThat(tokensOf(first)).doesNotContain("ExponentPushToken[shared-device]");
        assertThat(tokensOf(second)).contains("ExponentPushToken[shared-device]");
    }

    @Test
    void Expo_가_받지_않은_게_확실한_실패만_재시도한다() {
        assertThat(ExpoPushNotificationService.isSafeToRetry(
                new HttpServerErrorException(HttpStatus.SERVICE_UNAVAILABLE))).isTrue();
        assertThat(ExpoPushNotificationService.isSafeToRetry(
                new ResourceAccessException("connect", new ConnectException("refused")))).isTrue();
        // 응답 대기 시간 초과는 Expo 가 이미 받았을 수 있다 — 다시 보내면 알림이 두 번 간다
        assertThat(ExpoPushNotificationService.isSafeToRetry(
                new ResourceAccessException("read", new SocketTimeoutException("Read timed out")))).isFalse();
        assertThat(ExpoPushNotificationService.isSafeToRetry(new IllegalStateException("x"))).isFalse();
    }
}
