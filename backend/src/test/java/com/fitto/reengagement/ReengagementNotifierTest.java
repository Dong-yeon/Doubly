package com.fitto.reengagement;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.service.DailyQuestionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 재방문 리마인드 3종 — 2026-08 진단 리포트 "재방문 리마인드 3종".
 *
 * <p>핵심 계약은 <b>하루에 한 사람당 최대 한 통</b>이다. 세 조건에 동시에 걸리는 사람이
 * 세 통을 받는 순간 이 기능은 이탈 촉진 장치가 된다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ReengagementNotifierTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WorkoutService workoutService;
    @Autowired DailyQuestionService dailyQuestionService;
    @Autowired ReengagementNotifier notifier;

    @PersistenceContext EntityManager em;
    @Autowired TransactionTemplate tx;

    @MockitoBean NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private void workoutOn(Long userId, LocalDate date) {
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 30, null,
                List.of(new WorkoutSetRequest("스쿼트", "하체", 3, 10, new BigDecimal("50"), 1))));
    }

    /**
     * 가입 시각을 과거로 옮긴다 — 회원가입 API 로는 "3일 전 가입"을 만들 수 없다.
     *
     * <p>테스트 메서드에 {@code @Transactional} 을 걸지 않는 이유: 스케줄러가 자기 트랜잭션
     * 안에서 방금 쓴 값을 읽는지까지 확인하려면 커밋된 상태여야 한다.
     */
    private void backdateSignup(Long userId, LocalDateTime at) {
        tx.executeWithoutResult(status -> em.createNativeQuery(
                        "update users set created_at = :at where id = :id")
                .setParameter("at", at).setParameter("id", userId).executeUpdate());
    }

    @Test
    void 오늘_하면_이어지는_스트릭에_응원_리마인드를_보낸다() {
        Long user = register("re-streak@fitto.com");
        LocalDate today = LocalDate.now();
        for (int i = 3; i >= 1; i--) {
            workoutOn(user, today.minusDays(i));   // 어제까지 3일 연속
        }
        clearInvocations(notificationService);

        notifier.remind(today, LocalDateTime.now());

        verify(notificationService).notify(eq(user), eq(NotificationCategory.REMINDER),
                contains("3일 연속"), contains("오늘"), anyString());
    }

    @Test
    void 오늘_이미_기록했으면_스트릭_리마인드를_보내지_않는다() {
        Long user = register("re-streak-done@fitto.com");
        LocalDate today = LocalDate.now();
        for (int i = 3; i >= 0; i--) {
            workoutOn(user, today.minusDays(i));   // 오늘까지 4일 연속
        }
        clearInvocations(notificationService);

        notifier.remind(today, LocalDateTime.now());

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
    }

    /** 상대가 먼저 답했으면 "기다리는 중"이라는 사실 자체가 리마인드의 이유가 된다. */
    @Test
    void 상대가_답한_질문에_아직_답하지_않았으면_알린다() {
        long[] c = couple("re-q-a@fitto.com", "re-q-b@fitto.com");
        dailyQuestionService.answer(c[0], new AnswerRequest("나는 답했어"));
        clearInvocations(notificationService);

        notifier.remind(LocalDate.now(), LocalDateTime.now());

        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.REMINDER),
                contains("오늘의 질문"), contains("상대가 먼저"), anyString());
        verify(notificationService, never()).notify(eq(c[0]), any(), contains("오늘의 질문"), anyString(), anyString());
    }

    /** 한 번도 안 쓴 커플에게 매일 "질문에 답해보세요"를 보내면 그건 리마인드가 아니라 광고다. */
    @Test
    void 오늘의_질문을_한_번도_쓰지_않은_커플에게는_보내지_않는다() {
        long[] c = couple("re-q-never-a@fitto.com", "re-q-never-b@fitto.com");
        clearInvocations(notificationService);

        notifier.remind(LocalDate.now(), LocalDateTime.now());

        verify(notificationService, never()).notify(eq(c[0]), any(), contains("오늘의 질문"), anyString(), anyString());
        verify(notificationService, never()).notify(eq(c[1]), any(), contains("오늘의 질문"), anyString(), anyString());
    }

    @Test
    void 혼자_가입한_사람에게_가입_1일차와_3일차에_초대를_권한다() {
        Long day1 = register("re-solo-1@fitto.com");
        Long day3 = register("re-solo-3@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        backdateSignup(day1, now.minusDays(1).minusHours(2));
        backdateSignup(day3, now.minusDays(3).minusHours(2));
        clearInvocations(notificationService);

        notifier.remind(LocalDate.now(), now);

        verify(notificationService).notify(eq(day1), eq(NotificationCategory.REMINDER),
                anyString(), contains("커플을 연결하면"), anyString());
        verify(notificationService).notify(eq(day3), eq(NotificationCategory.REMINDER),
                anyString(), contains("커플을 연결하면"), anyString());
    }

    @Test
    void 커플이_연결된_사람에게는_초대_리마인드를_보내지_않는다() {
        long[] c = couple("re-solo-none-a@fitto.com", "re-solo-none-b@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        backdateSignup(c[0], now.minusDays(1).minusHours(2));
        backdateSignup(c[1], now.minusDays(1).minusHours(2));
        clearInvocations(notificationService);

        notifier.remind(LocalDate.now(), now);

        verify(notificationService, never()).notify(eq(c[0]), any(), anyString(), contains("커플을 연결하면"), anyString());
        verify(notificationService, never()).notify(eq(c[1]), any(), anyString(), contains("커플을 연결하면"), anyString());
    }

    /** 세 조건에 동시에 걸려도 한 통만 — 우선순위가 가장 높은 스트릭 위기가 이긴다. */
    @Test
    void 여러_조건에_걸려도_하루_한_통만_보낸다() {
        long[] c = couple("re-one-a@fitto.com", "re-one-b@fitto.com");
        LocalDate today = LocalDate.now();
        for (int i = 3; i >= 1; i--) {
            workoutOn(c[0], today.minusDays(i));       // 스트릭 위기
        }
        dailyQuestionService.answer(c[1], new AnswerRequest("나는 답했어"));  // 질문 미답변도 해당
        clearInvocations(notificationService);

        notifier.remind(today, LocalDateTime.now());

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.REMINDER),
                contains("3일 연속"), anyString(), anyString());
        verify(notificationService, never()).notify(eq(c[0]), any(), contains("오늘의 질문"), anyString(), anyString());
    }
}
