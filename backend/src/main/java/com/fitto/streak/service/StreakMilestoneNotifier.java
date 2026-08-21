package com.fitto.streak.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.relation.domain.Relation;
import com.fitto.streak.domain.StreakType;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Set;

/**
 * 스트릭 마일스톤 축하 — 7·30·100일을 <b>넘는 순간</b> 한 번만 알린다.
 *
 * <p><b>왜 필요한가</b>: 스트릭 숫자는 홈 카드에 조용히 올라갈 뿐, 넘긴 순간을 짚어주는
 * 곳이 없었다. 게임화(육성)는 보류된 결정이지만 "쌓아온 걸 축하한다"는 것은 벌점 없는
 * 순수 보상이라 그 보류 사유(강박 유발)에 걸리지 않는다.
 *
 * <p>발송 규칙:
 * <ul>
 *   <li><b>커플 스트릭</b>: 양쪽에 축하 푸시 + 채팅방에 축하 카드. 둘이 함께 만든 기록이라
 *       대화가 이어질 자리를 만들어 준다.</li>
 *   <li><b>개인 스트릭</b>: <b>상대에게만</b> 보낸다. 방금 저장 버튼을 누른 본인은 화면을
 *       보고 있어서 푸시가 중복이다(통화 결과 카드가 정상 종료를 알리지 않는 것과 같은 이유).</li>
 * </ul>
 *
 * <p>중복 발송 걱정이 없는 이유: 마일스톤 판정은 {@code currentCount} 가 <b>증가한 경우</b>
 * 에만 하고, 같은 값으로는 다시 증가할 수 없다. 끊겼다가 다시 7일을 채우면 그때는
 * 축하받아 마땅하다.
 */
@Component
public class StreakMilestoneNotifier {

    private static final Logger log = LoggerFactory.getLogger(StreakMilestoneNotifier.class);

    /** 축하할 지점 — 너무 촘촘하면 축하가 잔소리가 된다. */
    private static final Set<Integer> MILESTONES = Set.of(7, 30, 100);

    private final NotificationService notificationService;
    private final ChatService chatService;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 커밋 이후 카드 저장 전용 — <b>반드시 새 트랜잭션</b>이어야 한다.
     *
     * <p>{@code afterCommit} 안에서는 원래 트랜잭션의 자원이 아직 스레드에 묶여 있어,
     * 그냥 저장하면 <b>이미 커밋이 끝난</b> 트랜잭션에 참여하게 되고 그 쓰기는 조용히
     * 사라진다(로그도 예외도 없다 — 실제로 이 코드가 그렇게 한 번 깨졌다).
     */
    private final TransactionTemplate newTransaction;

    public StreakMilestoneNotifier(NotificationService notificationService,
                                   ChatService chatService,
                                   UserRepository userRepository,
                                   SimpMessagingTemplate messagingTemplate,
                                   PlatformTransactionManager transactionManager) {
        this.notificationService = notificationService;
        this.chatService = chatService;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 이 숫자가 축하 지점인지 — 호출부가 불필요한 조회를 하지 않도록 먼저 물어본다. */
    public static boolean isMilestone(int count) {
        return MILESTONES.contains(count);
    }

    /** 개인 스트릭 마일스톤 — 상대에게만 알린다. 커플이 없으면 아무 일도 없다. */
    public void personalReached(Long userId, Long partnerId, StreakType type, int count) {
        if (partnerId == null) return;
        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                count + "일 연속 " + label(type) + "! 🔥",
                userName(userId) + "님이 " + count + "일째 이어가고 있어요. 응원 한마디 보낼까요?",
                link(type));
    }

    /**
     * 커플 스트릭 마일스톤 — 양쪽 축하 푸시 + 채팅 카드.
     *
     * <p><b>채팅 카드는 커밋 이후에 쓴다.</b> 이 메서드는 스트릭 갱신 트랜잭션 안에서
     * 불리는데, 거기서 곧바로 카드를 저장하면 실패가 <b>같은 트랜잭션</b>을 rollback-only
     * 로 만든다 — 예외를 잡아도 바깥 커밋이 UnexpectedRollbackException 으로 터지고,
     * 축하 하나 때문에 스트릭 증가가 통째로 사라진다. 커밋 뒤로 미루면 카드 실패가
     * 로그 한 줄로 끝나고, 롤백된 스트릭의 유령 카드도 생기지 않는다
     * ({@code ExpoPushNotificationService.notify} 와 같은 이유·같은 패턴).
     */
    public void coupleReached(Long triggeredBy, Relation couple, StreakType type, int count) {
        String body = "둘이 함께 " + count + "일 연속 " + label(type) + "을(를) 이어가고 있어요 🎉";
        String title = "커플 " + count + "일 연속! 🔥";
        notificationService.notify(couple.getUserAId(), NotificationCategory.PARTNER, title, body, link(type));
        notificationService.notify(couple.getUserBId(), NotificationCategory.PARTNER, title, body, link(type));

        /*
         * content 는 화면에 그대로 띄워도 말이 되는 문장이다.
         * 앱이 STREAK_CARD 를 아직 모르는 구버전이어도 평범한 말풍선으로 읽힌다
         * (CALL_CARD 처럼 코드를 담으면 구버전에서 "COUPLE|7" 같은 글자가 노출된다).
         */
        afterCommit(() -> postCard(triggeredBy, couple.getId(), title + " " + body));
    }

    private void postCard(Long senderId, Long coupleId, String content) {
        try {
            ChatMessageResponse saved = newTransaction.execute(status ->
                    chatService.postSystemCard(senderId, coupleId, MessageType.STREAK_CARD, content));
            messagingTemplate.convertAndSend("/sub/rooms/" + coupleId, saved);
        } catch (Exception e) {
            log.warn("스트릭 마일스톤 채팅 카드 실패 couple={}: {}", coupleId, e.getMessage());
        }
    }

    /** 트랜잭션 안이면 커밋 이후로 미루고, 아니면 즉시 실행한다. */
    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }

    private String label(StreakType type) {
        return switch (type) {
            case PERSONAL, COUPLE -> "운동";
            case PERSONAL_MEAL, COUPLE_MEAL -> "식단 기록";
        };
    }

    private String link(StreakType type) {
        return switch (type) {
            case PERSONAL, COUPLE -> PushLinks.WORKOUT;
            case PERSONAL_MEAL, COUPLE_MEAL -> PushLinks.DIET;
        };
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
