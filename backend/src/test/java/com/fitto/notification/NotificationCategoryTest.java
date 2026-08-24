package com.fitto.notification;

import com.fitto.auth.dto.NotificationCategorySettingRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 카테고리별 푸시 수신 설정 — 2026-08 진단 리포트 "알림 인프라 2종".
 *
 * <p>판정은 {@code User.allowsNotification} 한 곳에서만 한다(발송 직전 단일 지점).
 * 그래서 여기서도 서비스가 아니라 그 판정 자체를 검증한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class NotificationCategoryTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired UserRepository userRepository;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    @Test
    void 신규_가입자는_모든_카테고리를_받는다() {
        Long id = register("cat-default@fitto.com");
        var user = userRepository.findById(id).orElseThrow();
        for (NotificationCategory category : NotificationCategory.values()) {
            assertThat(user.allowsNotification(category)).as(category.name()).isTrue();
        }
    }

    @Test
    void 카테고리를_끄면_그_카테고리만_막힌다() {
        Long id = register("cat-off@fitto.com");

        authService.updateNotificationCategories(id,
                new NotificationCategorySettingRequest(false, null, null, null));

        var user = userRepository.findById(id).orElseThrow();
        assertThat(user.allowsNotification(NotificationCategory.CHAT)).isFalse();
        assertThat(user.allowsNotification(NotificationCategory.ANNIVERSARY)).isTrue();
        assertThat(user.allowsNotification(NotificationCategory.PARTNER)).isTrue();
        assertThat(user.allowsNotification(NotificationCategory.REMINDER)).isTrue();
    }

    /** 부분 수정 — 다른 기기에서 방금 바꾼 설정을 오래된 값으로 덮어쓰지 않아야 한다. */
    @Test
    void 넘기지_않은_카테고리는_그대로_둔다() {
        Long id = register("cat-partial@fitto.com");
        authService.updateNotificationCategories(id,
                new NotificationCategorySettingRequest(false, false, false, false));

        var updated = authService.updateNotificationCategories(id,
                new NotificationCategorySettingRequest(true, null, null, null));

        assertThat(updated.notifyChat()).isTrue();
        assertThat(updated.notifyAnniversary()).isFalse();
        assertThat(updated.notifyPartner()).isFalse();
        assertThat(updated.notifyReminder()).isFalse();
    }

    /** 전체 스위치가 우선이다 — 꺼져 있으면 카테고리가 켜져 있어도 나가지 않는다. */
    @Test
    void 전체_스위치를_끄면_카테고리와_무관하게_막힌다() {
        Long id = register("cat-master-off@fitto.com");
        authService.updateNotificationSetting(id, false);

        var user = userRepository.findById(id).orElseThrow();
        for (NotificationCategory category : NotificationCategory.values()) {
            assertThat(user.allowsNotification(category)).as(category.name()).isFalse();
        }
    }
}
