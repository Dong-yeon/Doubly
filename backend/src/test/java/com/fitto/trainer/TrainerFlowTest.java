package com.fitto.trainer;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trainer.dto.AssignRoutineRequest;
import com.fitto.trainer.dto.TrainerDashboardResponse;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.dto.TrainerRoutineResponse;
import com.fitto.trainer.service.TrainerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 트레이너 플랫폼 통합 플로우 (phase 6~7) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TrainerFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TrainerService trainerService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    /** 트레이너 등록 + 회원 연결까지 만든다 */
    private long[] trainerWithMember(String trainerEmail, String memberEmail) {
        Long trainer = register(trainerEmail);
        trainerService.register(trainer, new TrainerProfileRequest("PT", "소개", null, null, 10, true));
        Long member = register(memberEmail);
        InviteCodeResponse invite = relationService.createTrainerInvite(trainer);
        relationService.connectTrainer(member, invite.code());
        return new long[]{trainer, member};
    }

    @Test
    void 트레이너_등록_후_회원을_연결하면_대시보드에_보인다() {
        long[] ids = trainerWithMember("t1@fitto.com", "tm1@fitto.com");

        TrainerDashboardResponse dashboard = trainerService.dashboard(ids[0]);
        assertThat(dashboard.totalMembers()).isEqualTo(1);
        assertThat(dashboard.members()).hasSize(1);
        assertThat(dashboard.members().get(0).todayCompleted()).isFalse();
    }

    @Test
    void 일반_사용자는_대시보드를_볼_수_없다() {
        Long user = register("t2@fitto.com");
        assertThatThrownBy(() -> trainerService.dashboard(user))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 루틴을_배정하면_회원이_조회하고_완료할_수_있다() {
        long[] ids = trainerWithMember("t3@fitto.com", "tm3@fitto.com");

        TrainerRoutineResponse assigned = trainerService.assignRoutine(ids[0],
                new AssignRoutineRequest(ids[1], "하체 루틴", "스쿼트 5x5", LocalDate.now()));
        assertThat(assigned.isCompleted()).isFalse();

        List<TrainerRoutineResponse> mine = trainerService.myRoutines(ids[1]);
        assertThat(mine).hasSize(1);

        TrainerRoutineResponse completed = trainerService.completeRoutine(ids[1], assigned.id());
        assertThat(completed.isCompleted()).isTrue();
        assertThat(completed.completedAt()).isNotNull();
    }

    @Test
    void 남의_회원에게는_루틴을_배정할_수_없다() {
        long[] a = trainerWithMember("t4@fitto.com", "tm4@fitto.com");
        long[] b = trainerWithMember("t5@fitto.com", "tm5@fitto.com");

        assertThatThrownBy(() -> trainerService.assignRoutine(a[0],
                new AssignRoutineRequest(b[1], "루틴", null, null)))
                .isInstanceOf(BusinessException.class);
    }
}
