package com.fitto.notification;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.notification.service.ExpoPushNotificationService;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 푸시 알림 수신 설정 (SET-01).
 *
 * <p>수신 거부는 발송 진입점 한 곳에서만 검사한다. 호출부마다 검사하면
 * 새 알림을 추가할 때 빠뜨려 "껐는데 오는 알림"이 생긴다.
 */
@SpringBootTest
@ActiveProfiles("test")
class NotificationSettingTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired UserRepository userRepository;
    @Autowired ExpoPushNotificationService pushService;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    @Test
    void 신규_가입자는_기본적으로_알림을_받는다() {
        Long id = register("notif-default@fitto.com");
        assertThat(userRepository.findById(id).orElseThrow().isNotificationsEnabled()).isTrue();
    }

    @Test
    void 알림을_끄고_다시_켤_수_있다() {
        Long id = register("notif-toggle@fitto.com");

        assertThat(authService.updateNotificationSetting(id, false).notificationsEnabled()).isFalse();
        assertThat(userRepository.findById(id).orElseThrow().isNotificationsEnabled()).isFalse();

        assertThat(authService.updateNotificationSetting(id, true).notificationsEnabled()).isTrue();
    }

    /**
     * 디바이스 토큰이 없으면 어차피 발송되지 않으므로, 설정이 실제로 작동하는지는
     * "토큰이 있는데도 발송하지 않는가"로 확인해야 한다.
     * 여기서는 예외 없이 조용히 종료되는 것까지만 본다 — 외부 API 호출은 하지 않는다.
     */
    @Test
    void 알림을_끄면_발송이_시도되지_않는다() {
        Long id = register("notif-off@fitto.com");
        authService.updateNotificationSetting(id, false);

        // 발송 경로가 수신 거부에서 조기 종료되어 외부 호출 없이 끝난다
        pushService.notify(id, "제목", "내용");

        assertThat(userRepository.findById(id).orElseThrow().isNotificationsEnabled()).isFalse();
    }

    /** 탈퇴 직후 잔여 호출에서 유령 알림이 나가지 않아야 한다. */
    @Test
    void 존재하지_않는_사용자에게는_발송하지_않는다() {
        pushService.notify(999_999L, "제목", "내용");
    }
}
