package com.fitto.common.analytics;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.dto.SaveRoutineRequest.Exercise;
import com.fitto.workout.service.WorkoutRoutineService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 최소 이벤트 로깅(2026-08 진단 리포트 "권장 순서" 2단계) — H2 기반.
 *
 * <p>PlanGuard.require/consume/requireCapacity 하나만 계측해도 게이팅된 기능 전체의
 * 사용량이 잡히는지, 그리고 가입·커플 연결처럼 PlanGuard 밖의 라이프사이클 지점도
 * 제대로 찍히는지 확인한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class EventLogFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WorkoutRoutineService workoutRoutineService;
    @Autowired EventLogRepository eventLogRepository;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    @Test
    void 회원가입하면_SIGNUP_이벤트가_남는다() {
        Long user = register("event-signup@fitto.com");

        List<EventLog> logs = eventLogRepository.findByUserIdAndEventType(user, AnalyticsEvent.SIGNUP);

        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getDetail()).isEqualTo("EMAIL");
    }

    /**
     * PlanGuard.requireCapacity 를 타는 대표 기능(운동 루틴 저장)이 성공하면
     * FEATURE_USED 가 detail=Feature.name() 으로 남아야 한다 — 이 하나만 계측해도
     * 12개 이상의 게이팅 지점 전체가 별도 수정 없이 잡힌다는 게 이 설계의 핵심이다.
     */
    @Test
    void 게이팅된_기능을_쓰면_FEATURE_USED_이벤트가_남는다() {
        Long user = register("event-feature-used@fitto.com");

        workoutRoutineService.save(user, new SaveRoutineRequest(
                "가슴 운동", List.of(new Exercise(
                        "벤치프레스", "가슴", 3, 10, new BigDecimal("60"), null, "가슴", "바벨"))));

        List<EventLog> logs = eventLogRepository.findByUserIdAndEventType(user, AnalyticsEvent.FEATURE_USED);

        assertThat(logs).anyMatch(l -> "WORKOUT_ROUTINE".equals(l.getDetail()));
    }

    @Test
    void 커플_연결하면_COUPLE_CONNECTED_이벤트가_관계ID와_함께_남는다() {
        Long a = register("event-couple-a@fitto.com");
        Long b = register("event-couple-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse relation = relationService.connectCouple(b, invite.code());

        List<EventLog> logs = eventLogRepository.findByUserIdAndEventType(b, AnalyticsEvent.COUPLE_CONNECTED);

        assertThat(logs).hasSize(1);
        assertThat(logs.get(0).getRelationId()).isEqualTo(relation.id());
    }
}
