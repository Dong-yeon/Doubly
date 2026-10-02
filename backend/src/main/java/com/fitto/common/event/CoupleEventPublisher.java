package com.fitto.common.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 커플 관계 채널(/sub/couple/{relationId})로 실시간 이벤트를 발행한다.
 *
 * <p><b>트랜잭션 안에서 부르면 커밋 뒤에 보낸다.</b> 이벤트는 "다시 읽어라"는 신호뿐이라, 커밋 전에
 * 보내면 상대 앱이 곧바로 다시 조회해도 방금 남긴 글·무드가 아직 안 보이고 다음 신호까지 낡은
 * 화면이 남는다(docs/daily-mood-current-state.md §8-9). 롤백되면 바뀐 게 없으니 보내지 않는다.
 * 트랜잭션 밖(배치·테스트·이미 커밋을 마친 뒤)이면 바로 보낸다 — 푸시
 * ({@code ExpoPushNotificationService.notify})와 같은 규칙이다.
 *
 * <p><b>커밋 이후 콜백({@code afterCommit}) 안에서 부르지 않는다.</b> 그 시점에도 동기화는 켜져 있어
 * 여기서 다시 예약하게 되는데, Spring 은 이미 돌고 있는 콜백 목록에 새로 붙은 것을 실행하지 않는다 —
 * 이벤트가 조용히 사라진다. 호출부가 커밋 시점을 직접 고르지 말고 그냥 이 메서드를 부르면 된다
 * (예전 {@code PlaceService.publishAfterCommit} 이 그렇게 하던 것을 여기로 모았다).
 */
@Component
public class CoupleEventPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    public CoupleEventPublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void publish(Long relationId, String type) {
        if (relationId == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            send(relationId, type);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                send(relationId, type);
            }
        });
    }

    private void send(Long relationId, String type) {
        messagingTemplate.convertAndSend("/sub/couple/" + relationId, new CoupleEvent(type));
    }
}
