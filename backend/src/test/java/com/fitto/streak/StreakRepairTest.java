package com.fitto.streak;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.time.KstClock;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.streak.domain.Streak;
import com.fitto.streak.domain.StreakType;
import com.fitto.streak.dto.StreakRepairResponse;
import com.fitto.streak.repository.StreakRepository;
import com.fitto.streak.service.StreakRepairService;
import com.fitto.streak.service.StreakService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 스트릭 복구권 — 2026-08 진단 리포트 "스트릭 복구권"({@code Feature.STREAK_REPAIR}).
 *
 * <p>테스트 프로파일은 무료 체험 기간(전원 PRO)이라 한도 자체가 아니라 <b>복구 규칙</b>을
 * 검증한다: 어제 하루만 빈 경우에만, 그 하루를 메워 연속을 잇는가.
 */
@SpringBootTest
@ActiveProfiles("test")
class StreakRepairTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WorkoutService workoutService;
    @Autowired StreakService streakService;
    @Autowired StreakRepairService repairService;
    @Autowired StreakRepository streakRepository;

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

    /** 그저께까지 기록 → 어제 하루가 비어 오늘은 0으로 보이는 상태. */
    private void makeBrokenYesterday(Long userId) {
        LocalDate today = KstClock.today();
        workoutOn(userId, today.minusDays(3));
        workoutOn(userId, today.minusDays(2));
    }

    @Test
    void 어제_하루만_비었으면_복구권으로_이어붙인다() {
        Long user = register("repair-ok@fitto.com");
        makeBrokenYesterday(user);
        assertThat(streakService.getMyStreak(user).currentCount()).isZero();   // 끊긴 상태
        assertThat(repairService.status(user).repairable()).isTrue();

        StreakRepairResponse result = repairService.repair(user);

        assertThat(result.targets()).contains("내 운동");
        // 2일 + 메운 하루 = 3일이 다시 살아 있다
        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(3);
    }

    /** 되살린 뒤 오늘 기록하면 그대로 이어져야 한다 — 그게 복구권이 파는 것이다. */
    @Test
    void 복구_후_오늘_기록하면_연속이_이어진다() {
        Long user = register("repair-continue@fitto.com");
        makeBrokenYesterday(user);
        repairService.repair(user);

        workoutOn(user, KstClock.today());

        assertThat(streakService.getMyStreak(user).currentCount()).isEqualTo(4);
    }

    @Test
    void 오늘_이미_이어지고_있으면_되살릴_게_없다() {
        Long user = register("repair-alive@fitto.com");
        LocalDate today = KstClock.today();
        workoutOn(user, today.minusDays(1));
        workoutOn(user, today);

        assertThat(repairService.status(user).repairable()).isFalse();
        assertThatThrownBy(() -> repairService.repair(user)).isInstanceOf(BusinessException.class);
    }

    /** 이틀 이상 비었으면 "이어붙이기"가 아니다 — 복구권을 소급 적용하면 숫자가 결제의 함수가 된다. */
    @Test
    void 이틀_이상_비었으면_되살릴_수_없다() {
        Long user = register("repair-too-old@fitto.com");
        LocalDate today = KstClock.today();
        workoutOn(user, today.minusDays(5));
        workoutOn(user, today.minusDays(4));

        assertThat(repairService.status(user).repairable()).isFalse();
        assertThatThrownBy(() -> repairService.repair(user)).isInstanceOf(BusinessException.class);
    }

    /** 되살릴 게 없으면 횟수를 쓰지 않아야 한다 — 선차감이라 되돌릴 수 없다. */
    @Test
    void 되살릴_게_없으면_복구권을_소모하지_않는다() {
        Long user = register("repair-nocost@fitto.com");
        Integer before = repairService.status(user).remaining();

        assertThatThrownBy(() -> repairService.repair(user)).isInstanceOf(BusinessException.class);

        assertThat(repairService.status(user).remaining()).isEqualTo(before);
    }

    /** 복구권 1회는 "어제 하루"를 메운다 — 그날에 걸린 스트릭을 한 번에 되살린다. */
    @Test
    void 커플_스트릭도_함께_되살린다() {
        long[] c = couple("repair-couple-a@fitto.com", "repair-couple-b@fitto.com");
        LocalDate today = KstClock.today();
        for (int i = 3; i >= 2; i--) {
            workoutOn(c[0], today.minusDays(i));
            workoutOn(c[1], today.minusDays(i));
        }
        assertThat(streakService.getCoupleStreak(c[0]).currentCount()).isZero();

        StreakRepairResponse result = repairService.repair(c[0]);

        assertThat(result.targets()).contains("내 운동", "커플 운동");
        assertThat(streakService.getCoupleStreak(c[0]).currentCount()).isEqualTo(3);
        // 상대 개인 스트릭은 남의 것이라 건드리지 않는다
        Streak partnerPersonal = streakRepository
                .findByUserIdAndStreakType(c[1], StreakType.PERSONAL).orElseThrow();
        assertThat(partnerPersonal.liveCount(today)).isZero();
    }

    @Test
    void 같은_날_두_번_되살릴_수는_없다() {
        Long user = register("repair-twice@fitto.com");
        makeBrokenYesterday(user);
        repairService.repair(user);

        assertThatThrownBy(() -> repairService.repair(user)).isInstanceOf(BusinessException.class);
    }
}
