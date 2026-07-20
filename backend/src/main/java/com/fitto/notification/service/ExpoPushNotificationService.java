package com.fitto.notification.service;

import com.fitto.common.notification.NotificationService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Expo Push 발송 구현 — 설계서 CHAT-06.
 * 수신자의 디바이스 토큰으로 Expo Push API 에 발송한다. 토큰이 없으면 아무 것도 하지 않는다.
 * (실제 발송은 네이티브 빌드에서 등록한 토큰이 있을 때 동작)
 */
@Service
public class ExpoPushNotificationService implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushNotificationService.class);
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final DeviceTokenRepository deviceTokenRepository;
    private final UserRepository userRepository;
    private final RestClient restClient = RestClient.create();

    public ExpoPushNotificationService(DeviceTokenRepository deviceTokenRepository,
                                       UserRepository userRepository) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.userRepository = userRepository;
    }

    /** 사용자를 못 찾으면 보내지 않는다 — 탈퇴 직후 잔여 호출에서 유령 알림이 나가지 않게. */
    private boolean isNotificationAllowed(Long userId) {
        return userRepository.findById(userId).map(User::isNotificationsEnabled).orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public void notify(Long recipientUserId, String title, String body) {
        if (recipientUserId == null) return;
        /*
         * 수신 거부 확인은 발송 직전 이 지점에서 한 번만 한다 (SET-01).
         * 호출부(운동·식단·채팅·여행 등 10곳 이상)에 각각 두면 새 알림을 추가할 때
         * 검사를 빠뜨리기 쉽고, 그러면 "껐는데 오는 알림"이 생긴다.
         */
        if (!isNotificationAllowed(recipientUserId)) return;

        List<DeviceToken> tokens = deviceTokenRepository.findByUserId(recipientUserId);
        if (tokens.isEmpty()) return;

        List<Map<String, Object>> messages = tokens.stream()
                .map(t -> Map.<String, Object>of(
                        "to", t.getToken(),
                        "title", title,
                        "body", body,
                        "sound", "default"))
                .toList();
        try {
            restClient.post()
                    .uri(EXPO_PUSH_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(messages)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("Expo push 발송 실패 recipient={}: {}", recipientUserId, e.getMessage());
        }
    }
}
