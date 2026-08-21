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

    public StreakMilestoneNotifier(NotificationService notificationService,
                                   ChatService chatService,
                                   UserRepository userRepository,
                                   SimpMessagingTemplate messagingTemplate) {
        this.notificationService = notificationService;
        this.chatService = chatService;
        this.userRepository = userRepository;
        this.messagingTemplate = messagingTemplate;
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
     * <p>채팅 카드 발행이 실패해도 축하 푸시는 이미 나간 뒤다. 카드는 부가물이므로
     * 실패를 삼키고 로그만 남긴다 — 스트릭 갱신(=운동/식단 저장)까지 되돌릴 일이 아니다.
     */
    public void coupleReached(Long triggeredBy, Relation couple, StreakType type, int count) {
        String body = "둘이 함께 " + count + "일 연속 " + label(type) + "을(를) 이어가고 있어요 🎉";
        String title = "커플 " + count + "일 연속! 🔥";
        notificationService.notify(couple.getUserAId(), NotificationCategory.PARTNER, title, body, link(type));
        notificationService.notify(couple.getUserBId(), NotificationCategory.PARTNER, title, body, link(type));

        try {
            /*
             * content 는 화면에 그대로 띄워도 말이 되는 문장이다.
             * 앱이 STREAK_CARD 를 아직 모르는 구버전이어도 평범한 말풍선으로 읽힌다
             * (CALL_CARD 처럼 코드를 담으면 구버전에서 "COUPLE|7" 같은 글자가 노출된다).
             */
            ChatMessageResponse saved = chatService.postSystemCard(triggeredBy, couple.getId(),
                    MessageType.STREAK_CARD, title + " " + body);
            messagingTemplate.convertAndSend("/sub/rooms/" + couple.getId(), saved);
        } catch (Exception e) {
            log.warn("스트릭 마일스톤 채팅 카드 실패 couple={}: {}", couple.getId(), e.getMessage());
        }
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
