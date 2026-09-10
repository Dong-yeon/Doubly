package com.fitto.notification.service;

import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.notification.domain.DeviceToken;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.user.repository.UserRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ScheduledExecutorService;
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
    private static final String EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

    private final DeviceTokenRepository deviceTokenRepository;
    private final DeviceTokenService deviceTokenService;
    private final UserRepository userRepository;
    private final RestClient restClient;
    /** 티켓을 받고 나서 영수증을 조회하기까지 기다리는 시간 — Expo 권장은 15분(테스트에서만 줄인다). */
    private final Duration receiptDelay;
    /** 영수증 조회 예약 — 발송 풀과 분리해 발송이 밀려도 조회가, 조회가 밀려도 발송이 막히지 않게 한다. */
    private final ScheduledExecutorService receiptScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "expo-push-receipt");
        t.setDaemon(true);
        return t;
    });

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
                                       DeviceTokenService deviceTokenService,
                                       UserRepository userRepository,
                                       @Value("${fitto.push.receipt-delay:PT15M}") Duration receiptDelay) {
        this.deviceTokenRepository = deviceTokenRepository;
        this.deviceTokenService = deviceTokenService;
        this.userRepository = userRepository;
        this.receiptDelay = receiptDelay;
        // 타임아웃 없는 기본 RestClient 는 exp.host 무응답 시 무한 대기한다 (Resend 와 동일 원칙)
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    @Override
    public void notify(Long recipientUserId, NotificationCategory category,
                       String title, String body, String link) {
        if (recipientUserId == null) return;
        /*
         * 트랜잭션 안에서 불렸으면 커밋 확정 후에만 발송을 예약한다 — 롤백되면 알림도 없다.
         * (CloudinaryImageDeleter.deleteAllAfterCommit 과 같은 패턴)
         */
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    executor.execute(() -> send(recipientUserId, category, title, body, link));
                }
            });
        } else {
            executor.execute(() -> send(recipientUserId, category, title, body, link));
        }
    }

    /** 발송 스레드에서 실행 — 어떤 실패도 앱 흐름에 전파하지 않는다. */
    private void send(Long recipientUserId, NotificationCategory category,
                      String title, String body, String link) {
        try {
            /*
             * 수신 거부 확인은 발송 직전 이 지점에서 한 번만 한다 (SET-01).
             * 호출부에 각각 두면 새 알림을 추가할 때 검사를 빠뜨리기 쉽고,
             * 그러면 "껐는데 오는 알림"이 생긴다. 전체 스위치와 카테고리별 스위치를
             * 한 번에 보는 것도 같은 이유다 — allowsNotification 하나만 통과하면 발송이다.
             * 사용자를 못 찾으면 보내지 않는다 — 탈퇴 직후 잔여 호출의 유령 알림 방지.
             */
            boolean allowed = userRepository.findById(recipientUserId)
                    .map(u -> u.allowsNotification(category))
                    .orElse(false);
            if (!allowed) return;

            List<DeviceToken> tokens = deviceTokenRepository.findByUserId(recipientUserId);
            if (tokens.isEmpty()) return;

            List<Map<String, Object>> messages = tokens.stream()
                    .map(t -> message(t.getToken(), title, body, link))
                    .toList();
            ExpoPushResponse response = restClient.post()
                    .uri(EXPO_PUSH_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(messages)
                    .retrieve()
                    .body(ExpoPushResponse.class);
            handleTickets(recipientUserId, tokens, response);
        } catch (Exception e) {
            log.warn("Expo push 발송 실패 recipient={}: {}", recipientUserId, e.getMessage());
        }
    }

    /**
     * 발송 결과(티켓) 처리 — <b>여기가 없으면 푸시는 관측 불가능한 기능이 된다.</b>
     *
     * <p>Expo 는 개별 메시지가 실패해도 <b>HTTP 200</b> 을 준다. 실패 사유는 본문
     * {@code data[i].details.error} 에만 들어 있어서, 응답을 버리면 "토큰이 죽었다"·
     * "APNs 인증서가 틀렸다" 같은 결정적인 정보가 통째로 사라진다. 실제로 "알림이 갑자기
     * 안 온다"를 조사할 때 서버 로그에 아무 단서도 남아 있지 않았다(2026-09-08).
     *
     * <p>티켓은 보낸 순서대로 돌아오므로 인덱스로 토큰과 짝짓는다. 주요 사유:
     * <ul>
     *   <li>{@code DeviceNotRegistered} — 앱 삭제·재설치·기기 교체. 토큰을 지운다.
     *   <li>{@code InvalidCredentials} — APNs 키/FCM 설정 문제. <b>그 플랫폼 전체가 죽는다.</b>
     *       토큰 잘못이 아니므로 지우지 않고 error 로 남긴다.
     *   <li>{@code MessageTooBig}·{@code MessageRateExceeded} — 우리 쪽 발송 문제.
     * </ul>
     *
     * <p>성공도 한 줄 남긴다. 성공이 조용하면 "토큰이 없어 안 보냄"과 "보냈음"이 로그에서
     * 구분되지 않아, 2026-09-10 조사 때 DB 를 직접 열어야 했다. 그리고 티켓 {@code ok} 는
     * "Expo 가 받았다"일 뿐이라 APNs/FCM 단계의 실패는 {@link #handleReceipts 영수증}에서만 보인다.
     */
    private void handleTickets(Long recipientUserId, List<DeviceToken> tokens, ExpoPushResponse response) {
        if (response == null || response.data() == null) return;

        List<String> dead = new ArrayList<>();
        Map<String, DeviceToken> accepted = new LinkedHashMap<>();
        List<Ticket> tickets = response.data();
        for (int i = 0; i < tickets.size() && i < tokens.size(); i++) {
            Ticket ticket = tickets.get(i);
            if (ticket == null) continue;
            DeviceToken token = tokens.get(i);
            if (!"error".equals(ticket.status())) {
                if (ticket.id() != null) accepted.put(ticket.id(), token);
                continue;
            }

            String reason = ticket.details() != null ? ticket.details().error() : null;
            if ("DeviceNotRegistered".equals(reason)) {
                dead.add(token.getToken());
                log.info("Expo push 토큰 폐기 recipient={} platform={}: 기기에 앱이 없음",
                        recipientUserId, token.getPlatform());
            } else {
                // 토큰을 지워선 안 되는 실패 — 설정 문제일 수 있으므로 눈에 띄게 남긴다
                log.error("Expo push 거절 recipient={} platform={} reason={}: {}",
                        recipientUserId, token.getPlatform(), reason, ticket.message());
            }
        }

        if (!accepted.isEmpty()) {
            log.info("Expo push 접수 recipient={} platforms={} — 영수증은 {} 뒤 확인",
                    recipientUserId, accepted.values().stream().map(DeviceToken::getPlatform).toList(),
                    receiptDelay);
            scheduleReceiptCheck(recipientUserId, accepted);
        }
        removeDead(recipientUserId, dead);
    }

    private void removeDead(Long recipientUserId, List<String> dead) {
        if (dead.isEmpty()) return;
        try {
            deviceTokenService.removeDeadTokens(dead);
        } catch (Exception e) {
            log.warn("죽은 푸시 토큰 정리 실패 recipient={}: {}", recipientUserId, e.getMessage());
        }
    }

    /**
     * 영수증 조회 예약 — 티켓 {@code ok} 뒤에 APNs/FCM 이 실제로 어떻게 처리했는지는
     * 영수증에만 있다. iOS 키가 틀렸을 때의 {@code InvalidCredentials} 가 대표적으로 여기서만
     * 나온다. 서버가 그 사이 재시작되면 조회는 사라지는데, 영수증은 부가 진단이라 감수한다.
     */
    private void scheduleReceiptCheck(Long recipientUserId, Map<String, DeviceToken> accepted) {
        try {
            receiptScheduler.schedule(() -> fetchReceipts(recipientUserId, accepted),
                    receiptDelay.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.warn("Expo push 영수증 조회 예약 실패 recipient={}: {}", recipientUserId, e.getMessage());
        }
    }

    private void fetchReceipts(Long recipientUserId, Map<String, DeviceToken> accepted) {
        try {
            ExpoReceiptResponse response = restClient.post()
                    .uri(EXPO_RECEIPTS_URL)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("ids", new ArrayList<>(accepted.keySet())))
                    .retrieve()
                    .body(ExpoReceiptResponse.class);
            handleReceipts(recipientUserId, accepted, response);
        } catch (Exception e) {
            log.warn("Expo push 영수증 조회 실패 recipient={}: {}", recipientUserId, e.getMessage());
        }
    }

    /**
     * 영수증 처리 — 티켓과 같은 규칙이다. 기기 미등록이면 토큰을 지우고, 그 밖의 실패는 error 로
     * 남긴다. 영수증은 조회 시점에 아직 없을 수 있는데(Expo 가 처리 중), 그 경우 응답 map 에
     * 그 id 가 빠져 있다 — 없는 것은 실패가 아니므로 건드리지 않는다.
     */
    void handleReceipts(Long recipientUserId, Map<String, DeviceToken> accepted, ExpoReceiptResponse response) {
        if (response == null || response.data() == null) return;

        List<String> dead = new ArrayList<>();
        response.data().forEach((ticketId, receipt) -> {
            DeviceToken token = accepted.get(ticketId);
            if (token == null || receipt == null || !"error".equals(receipt.status())) return;

            String reason = receipt.details() != null ? receipt.details().error() : null;
            if ("DeviceNotRegistered".equals(reason)) {
                dead.add(token.getToken());
                log.info("Expo push 토큰 폐기(영수증) recipient={} platform={}: 기기에 앱이 없음",
                        recipientUserId, token.getPlatform());
            } else {
                log.error("Expo push 전달 실패(영수증) recipient={} platform={} reason={}: {}",
                        recipientUserId, token.getPlatform(), reason, receipt.message());
            }
        });
        removeDead(recipientUserId, dead);
    }

    /** Expo Push API 응답 — 우리가 보는 필드만. 나머지는 무시한다. */
    record ExpoPushResponse(List<Ticket> data) {}

    record Ticket(String id, String status, String message, TicketDetails details) {}

    record TicketDetails(String error) {}

    /** 영수증 응답 — 티켓 id 를 키로 하는 map. 아직 처리 안 된 id 는 빠져서 온다. */
    record ExpoReceiptResponse(Map<String, Receipt> data) {}

    record Receipt(String status, String message, TicketDetails details) {}

    /**
     * Expo 메시지 한 건.
     *
     * <p>{@code data.link} 가 알림 탭 딥링크의 전부다 — 앱이 이 값 앞에 {@code doubly://} 를
     * 붙여 열고, 없으면 앱만 열린다({@code frontend/src/navigation/linking.ts}).
     * {@code Map.of} 를 못 쓰는 이유는 link 가 null 일 수 있어서다.
     */
    private Map<String, Object> message(String token, String title, String body, String link) {
        Map<String, Object> m = new HashMap<>();
        m.put("to", token);
        m.put("title", title);
        m.put("body", body);
        m.put("sound", "default");
        if (link != null) {
            m.put("data", Map.of("link", link));
        }
        return m;
    }

    @PreDestroy
    void shutdown() {
        executor.shutdown();
        receiptScheduler.shutdownNow();
    }
}
