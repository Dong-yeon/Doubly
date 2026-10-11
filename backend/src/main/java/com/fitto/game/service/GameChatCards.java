package com.fitto.game.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 게임이 채팅에 남기는 카드(결과·오답·그림 공유) — 종목 공통. docs/game-current-state.md 8-1 #4·#5.
 *
 * <p><b>카드는 게임 트랜잭션이 커밋된 뒤, 새 트랜잭션에서 쓴다.</b> 예전에는 게임 트랜잭션 안에서
 * {@code ChatService.postSystemCard} 를 바로 불렀다. 그 메서드는 프록시를 거쳐 같은 트랜잭션에 참여하므로,
 * 안에서 예외가 나면 바깥 트랜잭션이 rollback-only 가 된다 — {@code try/catch} 로 잡아도 커밋이
 * {@code UnexpectedRollbackException} 으로 터지고, <b>카드 하나 때문에 정답·승리·완성이 통째로 사라진다</b>.
 * 커밋 뒤로 미루면 카드 실패는 로그 한 줄로 끝난다.
 *
 * <p>같은 이유로 소켓 전송도 커밋 뒤에 한다. 커밋 전에 흘리면 롤백된 판의 카드가 상대 화면에만 남는다.
 * 스트릭 축하 카드({@code StreakMilestoneNotifier})와 같은 패턴이다.
 */
@Component
public class GameChatCards {

    private static final Logger log = LoggerFactory.getLogger(GameChatCards.class);

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * 커밋 이후 카드 저장 전용 — <b>반드시 새 트랜잭션</b>이어야 한다. {@code afterCommit} 안에서는 원래
     * 트랜잭션의 자원이 아직 스레드에 묶여 있어, 그냥 저장하면 이미 끝난 트랜잭션에 참여해 쓰기가 조용히 사라진다.
     */
    private final TransactionTemplate newTransaction;

    public GameChatCards(ChatService chatService,
                         SimpMessagingTemplate messagingTemplate,
                         PlatformTransactionManager transactionManager) {
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 글만 있는 카드 — 결과·오답 */
    public void post(Long senderId, Long relationId, MessageType type, String content, String what) {
        post(senderId, relationId, type, content, null, what);
    }

    /**
     * 카드 한 장을 커밋 뒤에 남기고 방에 흘린다. 트랜잭션 밖에서 불리면 바로 한다.
     * <b>어떤 실패도 호출자에게 올라가지 않는다</b> — 채팅 카드는 곁가지다.
     *
     * @param what 로그용 이름(예: "오목 결과")
     */
    public void post(Long senderId, Long relationId, MessageType type,
                     String content, String imageUrl, String what) {
        Runnable action = () -> {
            try {
                ChatMessageResponse saved = newTransaction.execute(status ->
                        chatService.postSystemCard(senderId, relationId, type, content, imageUrl));
                messagingTemplate.convertAndSend("/sub/rooms/" + relationId, saved);
            } catch (Exception e) {
                log.warn("게임 채팅 카드 실패({}) couple={}: {}", what, relationId, e.getMessage());
            }
        };
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
}
