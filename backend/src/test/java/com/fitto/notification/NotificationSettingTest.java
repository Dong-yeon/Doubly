package com.fitto.notification;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.notification.service.ExpoPushNotificationService;
import com.fitto.user.domain.User;
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

        assertThat(authService.updateNotificationSetting(id, false, null, null, null, null)
                .notificationsEnabled()).isFalse();
        assertThat(userRepository.findById(id).orElseThrow().isNotificationsEnabled()).isFalse();

        assertThat(authService.updateNotificationSetting(id, true, null, null, null, null)
                .notificationsEnabled()).isTrue();
    }

    /**
     * 디바이스 토큰이 없으면 어차피 발송되지 않으므로, 설정이 실제로 작동하는지는
     * "토큰이 있는데도 발송하지 않는가"로 확인해야 한다.
     * 여기서는 예외 없이 조용히 종료되는 것까지만 본다 — 외부 API 호출은 하지 않는다.
     */
    @Test
    void 알림을_끄면_발송이_시도되지_않는다() {
        Long id = register("notif-off@fitto.com");
        authService.updateNotificationSetting(id, false, null, null, null, null);

        // 발송 경로가 수신 거부에서 조기 종료되어 외부 호출 없이 끝난다
        pushService.notify(id, "제목", "내용");

        assertThat(userRepository.findById(id).orElseThrow().isNotificationsEnabled()).isFalse();
    }

    /** 마스터는 켠 채로 특정 카테고리만 꺼도, 그 카테고리 발송은 조용히 종료돼야 한다. */
    @Test
    void 카테고리를_끄면_그_카테고리_발송만_시도되지_않는다() {
        Long id = register("notif-off-category@fitto.com");
        authService.updateNotificationSetting(id, null, false, null, null, null); // 채팅만 끔

        pushService.notify(id, NotificationCategory.CHAT, "제목", "내용");

        User user = userRepository.findById(id).orElseThrow();
        assertThat(user.allowsCategory(NotificationCategory.CHAT)).isFalse();
        assertThat(user.allowsCategory(NotificationCategory.PARTNER_ACTIVITY)).isTrue();
    }

    /** 탈퇴 직후 잔여 호출에서 유령 알림이 나가지 않아야 한다. */
    @Test
    void 존재하지_않는_사용자에게는_발송하지_않는다() {
        pushService.notify(999_999L, "제목", "내용");
    }

    @Test
    void 신규_가입자는_모든_카테고리를_기본으로_받는다() {
        Long id = register("notif-cat-default@fitto.com");
        User user = userRepository.findById(id).orElseThrow();

        for (NotificationCategory category : NotificationCategory.values()) {
            assertThat(user.allowsCategory(category)).isTrue();
        }
    }

    /** null 로 보낸 필드는 건드리지 않는다 — 화면에서 토글 하나만 바꿔도 나머지가 안 바뀌어야 한다. */
    @Test
    void 카테고리별_설정을_부분_수정할_수_있다() {
        Long id = register("notif-cat-partial@fitto.com");

        authService.updateNotificationSetting(id, null, false, null, null, null); // 채팅만 끔

        User user = userRepository.findById(id).orElseThrow();
        assertThat(user.isNotifyChat()).isFalse();
        assertThat(user.isNotifyAnniversary()).isTrue();
        assertThat(user.isNotifyPartnerActivity()).isTrue();
        assertThat(user.isNotifyReminder()).isTrue();
        assertThat(user.isNotificationsEnabled()).isTrue(); // 마스터는 건드리지 않음
    }

    /** V25 도입 당시 못박은 방침 — 마스터가 꺼지면 카테고리 값과 무관하게 전부 차단된다. */
    @Test
    void 마스터_스위치가_꺼지면_카테고리_값과_무관하게_차단된다() {
        Long id = register("notif-cat-master-off@fitto.com");
        authService.updateNotificationSetting(id, false, null, null, null, null);

        User user = userRepository.findById(id).orElseThrow();
        // 카테고리 값 자체는 그대로 true — 다시 켜면 이전 토글 상태가 보존돼야 한다
        assertThat(user.isNotifyChat()).isTrue();
        // 하지만 마스터가 꺼졌으니 최종 판정은 전부 false
        for (NotificationCategory category : NotificationCategory.values()) {
            assertThat(user.allowsCategory(category)).isFalse();
        }
    }

    @Test
    void 특정_카테고리만_꺼도_다른_카테고리는_그대로_허용된다() {
        Long id = register("notif-cat-single-off@fitto.com");
        authService.updateNotificationSetting(id, null, false, null, null, null); // 채팅만 끔

        User user = userRepository.findById(id).orElseThrow();
        assertThat(user.allowsCategory(NotificationCategory.CHAT)).isFalse();
        assertThat(user.allowsCategory(NotificationCategory.ANNIVERSARY)).isTrue();
        assertThat(user.allowsCategory(NotificationCategory.PARTNER_ACTIVITY)).isTrue();
        assertThat(user.allowsCategory(NotificationCategory.REMINDER)).isTrue();
    }
}
