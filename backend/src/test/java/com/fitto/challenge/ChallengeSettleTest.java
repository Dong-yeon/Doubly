package com.fitto.challenge;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.challenge.domain.ChallengeType;
import com.fitto.challenge.dto.ChallengeResponse;
import com.fitto.challenge.dto.CreateChallengeRequest;
import com.fitto.challenge.service.ChallengeSettleNotifier;
import com.fitto.challenge.service.CoupleChallengeService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 대결 종료 자동 판정 — 2026-08 진단 리포트 "대결 종료 자동 판정 푸시".
 *
 * <p>지금까지 대결은 기간이 끝나도 아무 일도 일어나지 않아 클라이맥스가 없었다.
 *
 * <p>테스트 DB(H2 인메모리)는 <b>클래스 사이에 공유된다</b>. 스케줄러는 "끝났는데 판정 안 된"
 * 대결을 전부 훑으므로 발송 건수 총합에 기대지 않고, <b>이 테스트가 만든 커플에게 무엇이
 * 갔는지</b>만 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
class ChallengeSettleTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CoupleChallengeService challengeService;
    @Autowired ChallengeSettleNotifier settleNotifier;
    @Autowired WorkoutService workoutService;

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

    @Test
    void 기간이_끝난_대결의_승자를_확정하고_양쪽에_알린다() {
        long[] c = couple("settle-a@fitto.com", "settle-b@fitto.com");
        LocalDate start = LocalDate.now().minusDays(5);
        challengeService.create(c[0], new CreateChallengeRequest(
                ChallengeType.WORKOUT, "5일 대결", start, LocalDate.now().minusDays(1), "설거지"));
        workoutOn(c[0], start);
        workoutOn(c[0], start.plusDays(1));
        workoutOn(c[1], start);
        clearInvocations(notificationService);

        settleNotifier.settleEndedChallenges(LocalDate.now());

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.PARTNER),
                contains("승리"), contains("2 : 1"), anyString());
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.PARTNER),
                eq("대결이 끝났어요"), contains("1 : 2"), anyString());

        ChallengeResponse settled = challengeService.list(c[0]).get(0);
        assertThat(settled.settled()).isTrue();
        assertThat(settled.result()).isEqualTo("ME");
        assertThat(challengeService.list(c[1]).get(0).result()).isEqualTo("PARTNER");
    }

    @Test
    void 아무도_기록하지_않았으면_무승부로_알린다() {
        long[] c = couple("settle-tie-a@fitto.com", "settle-tie-b@fitto.com");
        challengeService.create(c[0], new CreateChallengeRequest(
                ChallengeType.WORKOUT, "무승부 대결", LocalDate.now().minusDays(3),
                LocalDate.now().minusDays(1), null));
        clearInvocations(notificationService);

        settleNotifier.settleEndedChallenges(LocalDate.now());

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.PARTNER),
                contains("무승부"), anyString(), anyString());
        assertThat(challengeService.list(c[0]).get(0).result()).isEqualTo("TIE");
    }

    /** settled_at 이 발송 이력을 겸한다 — 다음 날 다시 돌아도 두 번 알리지 않는다. */
    @Test
    void 이미_판정된_대결은_다시_알리지_않는다() {
        long[] c = couple("settle-once-a@fitto.com", "settle-once-b@fitto.com");
        challengeService.create(c[0], new CreateChallengeRequest(
                ChallengeType.WORKOUT, "한 번만", LocalDate.now().minusDays(3),
                LocalDate.now().minusDays(1), null));
        settleNotifier.settleEndedChallenges(LocalDate.now());
        clearInvocations(notificationService);

        settleNotifier.settleEndedChallenges(LocalDate.now());

        verify(notificationService, never()).notify(eq(c[0]), any(), anyString(), anyString(), anyString());
        verify(notificationService, never()).notify(eq(c[1]), any(), anyString(), anyString(), anyString());
    }

    /**
     * 스케줄 진입점(무인자)으로도 실제로 <b>저장</b>돼야 한다.
     *
     * <p>같은 객체의 메서드를 직접 부르면 프록시를 타지 않아 {@code @Transactional} 이
     * 걸리지 않는다. 그러면 settle() 로 바꾼 엔티티가 아무 데도 반영되지 않고, 매일 아침
     * 같은 대결을 다시 알리게 된다 — 기준일을 받는 메서드만 테스트하면 이 결함이 숨는다.
     */
    @Test
    void 스케줄_진입점으로_돌려도_판정이_저장된다() {
        long[] c = couple("settle-sched-a@fitto.com", "settle-sched-b@fitto.com");
        // KST/UTC 어느 쪽으로 오늘을 재도 이미 끝난 기간
        challengeService.create(c[0], new CreateChallengeRequest(
                ChallengeType.WORKOUT, "스케줄 판정", LocalDate.now().minusDays(5),
                LocalDate.now().minusDays(3), null));

        settleNotifier.settleEndedChallenges();

        assertThat(challengeService.list(c[0]).get(0).settled()).isTrue();
    }

    @Test
    void 진행_중인_대결은_건드리지_않는다() {
        long[] c = couple("settle-live-a@fitto.com", "settle-live-b@fitto.com");
        challengeService.create(c[0], new CreateChallengeRequest(
                ChallengeType.WORKOUT, "진행 중", LocalDate.now().minusDays(1),
                LocalDate.now().plusDays(3), null));

        settleNotifier.settleEndedChallenges(LocalDate.now());

        ChallengeResponse live = challengeService.list(c[0]).get(0);
        assertThat(live.settled()).isFalse();
        assertThat(live.result()).isNull();
    }
}
