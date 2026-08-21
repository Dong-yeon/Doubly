package com.fitto.question;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.service.DailyQuestionService;
import com.fitto.question.service.DailyQuestionUnansweredNotifier;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 오늘의 질문 미답변 저녁 리마인드 (DailyQuestionUnansweredNotifier) — 대상 판별.
 * 절대 개수로 단언하지 않고 이 테스트가 만든 사용자 id 기준으로만 검증한다
 * ({@code MemoriesNotifierTest} 와 같은 이유 — 같은 인메모리 H2 공유).
 */
@SpringBootTest
@ActiveProfiles("test")
class DailyQuestionUnansweredNotifierTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 20);
    private static final AtomicInteger IP_SEQ = new AtomicInteger();

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired DailyQuestionService dailyQuestionService;
    @Autowired DailyQuestionUnansweredNotifier notifier;

    @MockitoBean NotificationService notificationService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                        "10.41.0." + IP_SEQ.incrementAndGet())
                .user().id();
    }

    private long[] couple(String a, String b) {
        Long ida = register(a);
        Long idb = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ida);
        relationService.connectCouple(idb, invite.code());
        return new long[]{ida, idb};
    }

    /**
     * 답을 남긴 뒤 question_date 를 테스트 기준일로 못박는다 — 실제 wall-clock 에 의존하지 않기 위함.
     * executeUpdate() 는 트랜잭션이 필요하므로, 이 메서드를 부르는 @Test 메서드 쪽에 @Transactional 을 둔다
     * (Spring 테스트의 트랜잭션 지원은 @Test 메서드 단위로만 걸리고, 임의 헬퍼 메서드에 붙여선 효과가 없다).
     */
    void answerOn(Long userId, LocalDate date) {
        dailyQuestionService.answer(userId, new AnswerRequest("테스트 답변 " + userId));
        em.createNativeQuery("update daily_answers set question_date = :d where user_id = :uid")
                .setParameter("d", date)
                .setParameter("uid", userId)
                .executeUpdate();
        em.flush();
        em.clear();
    }

    @Test
    void 둘_다_안_답했으면_둘_다_리마인드를_받는다() {
        long[] c = couple("dq-none-a@fitto.com", "dq-none-b@fitto.com");

        notifier.notifyUnanswered(TODAY);

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void 이미_답한_사람에게는_리마인드가_가지_않는다() {
        long[] c = couple("dq-answered-a@fitto.com", "dq-answered-b@fitto.com");
        answerOn(c[0], TODAY);

        notifier.notifyUnanswered(TODAY);

        verify(notificationService, never()).notify(eq(c[0]), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    void 커플이_아니면_대상에서_빠진다() {
        Long solo = register("dq-solo@fitto.com");

        notifier.notifyUnanswered(TODAY);

        verify(notificationService, never()).notify(eq(solo), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }
}
