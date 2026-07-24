package com.fitto.notification.service;

import com.fitto.common.notification.NotificationService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * Expo Push 발송 구현 — 설계서 CHAT-06.
 * 수신자의 디바이스 토큰으로 Expo Push API 에 발송한다. 토큰이 없으면 아무 것도 하지 않는다.
 * (실제 발송은 네이티브 빌드에서 등록한 토큰이 있을 때 동작)
 *
 * <p><b>발송은 요청 스레드에서 하지 않는다.</b> 호출부(채팅 전송·피드 작성 등 13곳)
 * 다수가 쓰기 트랜잭션 안에서 notify 를 부르는데, 여기서 exp.host 를 동기로 기다리면
 * DB 커넥션을 문 채로 외부 지연을 흡수하게 되어 Expo 장애가 커넥션 풀 고갈로 전파된다.
 * 그래서 (1) 트랜잭션 커밋 이후에 (2) 전용 스레드에서 (3) 타임아웃을 걸고 발송한다.
 * 커밋 이후로 미루는 것은 롤백된 작업의 유령 알림을 막는 효과도 있다.
 */
@Service
public class ExpoPushNotificationService implements NotificationService {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushNotificationService.class);
    private static final String EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

    private final DeviceTokenRepository deviceTokenRepository;
    private final UserRepository userRepository;
    private final RestClient restClient;

    /**
     * 발송 전용 소형 풀 — 푸시는 유실돼도 앱이 깨지지 않는 부가 기능이므로,
     * 대기열이 가득 차면(Expo 장기 장애) 새 발송을 버리고 경고만 남긴다.
     * 무한 대기열을 쓰면 장애 동안 힙이 자라기만 한다.
     */
    private final ThreadPoolExecutor executor = new ThreadPoolExecutor(
            1, 2, 60, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(1_000),
            r -> {
                Thread t = new Thread(r, "expo-push");
                t.setDaemon(true);
                return t;
            },
            (r, pool) -> log.warn("Expo push 대기열 포화 — 발송 1건 폐기"));

    public ExpoPushNotificationService(DeviceTokenRepository deviceTokenRepository,
                                       UserRepository userRepository) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.userRepository = userRepository;
        // 타임아웃 없는 기본 RestClient 는 exp.host 무응답 시 무한 대기한다 (Resend 와 동일 원칙)
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public void notify(Long recipientUserId, String title, String body) {
        if (recipientUserId == null) return;
        /*
         * 트랜잭션 안에서 불렸으면 커밋 확정 후에만 발송을 예약한다 — 롤백되면 알림도 없다.
         * (CloudinaryImageDeleter.deleteAllAfterCommit 과 같은 패턴)
         */
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(() -> send(recipientUserId, title, body));
                }
            });
        } else {
            executor.execute(() -> send(recipientUserId, title, body));
        }
    }

    /** 발송 스레드에서 실행 — 어떤 실패도 앱 흐름에 전파하지 않는다. */
    private void send(Long recipientUserId, String title, String body) {
        try {
            /*
             * 수신 거부 확인은 발송 직전 이 지점에서 한 번만 한다 (SET-01).
             * 호출부에 각각 두면 새 알림을 추가할 때 검사를 빠뜨리기 쉽고,
             * 그러면 "껐는데 오는 알림"이 생긴다.
             * 사용자를 못 찾으면 보내지 않는다 — 탈퇴 직후 잔여 호출의 유령 알림 방지.
             */
            boolean allowed = userRepository.findById(recipientUserId)
                    .map(User::isNotificationsEnabled)
                    .orElse(false);
            if (!allowed) return;

            List<DeviceToken> tokens = deviceTokenRepository.findByUserId(recipientUserId);
            if (tokens.isEmpty()) return;

            List<Map<String, Object>> messages = tokens.stream()
                    .map(t -> Map.<String, Object>of(
                            "to", t.getToken(),
                            "title", title,
                            "body", body,
                            "sound", "default"))
                    .toList();
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

    @PreDestroy
    void shutdown() {
        executor.shutdown();
    }
}
