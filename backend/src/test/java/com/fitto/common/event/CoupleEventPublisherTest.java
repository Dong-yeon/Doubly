package com.fitto.common.event;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 실시간 이벤트는 커밋 뒤에 나간다 — 커밋 전에 보내면 상대 앱이 다시 조회해도 방금 바뀐 게 안 보인다
 * (docs/daily-mood-current-state.md §8-9). 스프링 없이 트랜잭션 동기화를 직접 켜서 커밋·롤백을 가른다.
 */
class CoupleEventPublisherTest {

    private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
    private final CoupleEventPublisher publisher = new CoupleEventPublisher(messaging);

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void 트랜잭션_안에서는_커밋_뒤에_보낸다() {
        TransactionSynchronizationManager.initSynchronization();

        publisher.publish(7L, CoupleEvent.FEED);
        verify(messaging, never()).convertAndSend(any(String.class), any(Object.class));

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        verify(messaging).convertAndSend("/sub/couple/7", new CoupleEvent(CoupleEvent.FEED));
    }

    @Test
    void 롤백되면_보내지_않는다() {
        TransactionSynchronizationManager.initSynchronization();

        publisher.publish(7L, CoupleEvent.MOOD);
        // 롤백은 afterCommit 없이 afterCompletion 만 부른다
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(s -> s.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        verifyNoInteractions(messaging);
    }

    @Test
    void 트랜잭션_밖이면_바로_보낸다() {
        publisher.publish(7L, CoupleEvent.MOOD);
        verify(messaging).convertAndSend("/sub/couple/7", new CoupleEvent(CoupleEvent.MOOD));
    }

    @Test
    void 관계가_없으면_아무것도_안_한다() {
        publisher.publish(null, CoupleEvent.MOOD);
        verifyNoInteractions(messaging);
    }
}
