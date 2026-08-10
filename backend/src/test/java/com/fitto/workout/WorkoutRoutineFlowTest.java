package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 내 운동 루틴 통합 플로우 — 저장/스마트 동기화(Save-on-Finish) 업데이트/삭제/시스템 템플릿. H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class WorkoutRoutineFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    com.fitto.workout.service.WorkoutRoutineService routineService;
    @Autowired
    ExerciseCatalogRepository catalogRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private SaveRoutineRequest sample(String title) {
        return new SaveRoutineRequest(title, List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨")));
    }

    private Long catalogId(String name) {
        return catalogRepository.findAllByOrderByMuscleGroupAscNameAsc().stream()
                .filter(c -> c.getName().equals(name))
                .findFirst().orElseThrow().getId();
    }

    @Test
    void 루틴을_저장하고_조회한다() {
        Long user = register("r1@fitto.com");
        RoutineResponse saved = routineService.save(user, sample("가슴 루틴"));

        assertThat(saved.id()).isNotNull();
        assertThat(saved.exercises()).hasSize(1);
        assertThat(saved.exercises().get(0).exerciseName()).isEqualTo("벤치프레스");
        assertThat(saved.exercises().get(0).muscleGroup()).isEqualTo("가슴");
    }

    @Test
    void 스마트_동기화로_루틴_구성을_교체한다() {
        Long user = register("r2@fitto.com");
        RoutineResponse saved = routineService.save(user, sample("가슴 루틴"));

        // 세션에서 벤치프레스 → 덤벨 프레스로 바꾸고 세트를 4개로 늘린 뒤 "루틴에도 반영"
        SaveRoutineRequest updated = new SaveRoutineRequest("가슴 루틴", List.of(
                new SaveRoutineRequest.Exercise("덤벨 프레스", "근력", 4, 10, null, null, "가슴", "덤벨")));
        RoutineResponse result = routineService.update(user, saved.id(), updated);

        assertThat(result.exercises()).hasSize(1);
        assertThat(result.exercises().get(0).exerciseName()).isEqualTo("덤벨 프레스");
        assertThat(result.exercises().get(0).targetSets()).isEqualTo(4);

        // 재조회해도 교체된 구성이 유지된다 (orphanRemoval 로 기존 종목은 삭제됨)
        RoutineResponse redetail = routineService.detail(user, saved.id());
        assertThat(redetail.exercises()).hasSize(1);
        assertThat(redetail.exercises().get(0).exerciseName()).isEqualTo("덤벨 프레스");
    }

    @Test
    void 남의_루틴은_동기화할_수_없다() {
        Long owner = register("r3@fitto.com");
        Long other = register("r4@fitto.com");
        RoutineResponse saved = routineService.save(owner, sample("가슴 루틴"));

        assertThatThrownBy(() -> routineService.update(other, saved.id(), sample("가슴 루틴")))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 종목별_휴식시간과_대체종목을_저장한다() {
        Long user = register("r5@fitto.com");
        Long dumbbellPressId = catalogId("덤벨 프레스");
        Long dipsId = catalogId("딥스");

        SaveRoutineRequest request = new SaveRoutineRequest("가슴 루틴", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨",
                        180, List.of(dumbbellPressId, dipsId))));
        RoutineResponse saved = routineService.save(user, request);

        var exercise = saved.exercises().get(0);
        assertThat(exercise.restSeconds()).isEqualTo(180);
        assertThat(exercise.alternatives()).hasSize(2);
        assertThat(exercise.alternatives().stream().map(RoutineResponse.Alternative::name))
                .containsExactly("덤벨 프레스", "딥스");
    }

    @Test
    void 시스템_템플릿_목록을_조회한다() {
        List<RoutineResponse> templates = routineService.systemTemplates();

        assertThat(templates).isNotEmpty();
        assertThat(templates).allMatch(RoutineResponse::systemTemplate);
        assertThat(templates).anyMatch(t -> t.title().contains("20분 전신"));
    }

    @Test
    void 시스템_템플릿을_내_루틴으로_복사한다() {
        Long user = register("r6@fitto.com");
        RoutineResponse template = routineService.systemTemplates().stream()
                .filter(t -> t.title().contains("20분 전신"))
                .findFirst().orElseThrow();

        RoutineResponse copied = routineService.copy(user, template.id());

        assertThat(copied.id()).isNotEqualTo(template.id());
        assertThat(copied.systemTemplate()).isFalse();
        assertThat(copied.title()).isEqualTo(template.title());
        assertThat(copied.exercises()).hasSize(template.exercises().size());
        // 무게는 사람마다 달라 복사해오지 않는다
        assertThat(copied.exercises()).allMatch(e -> e.weightKg() == null);

        // 내 루틴 목록에도 들어간다
        assertThat(routineService.list(user)).anyMatch(r -> r.id().equals(copied.id()));
    }

    @Test
    void 시스템_템플릿이_아닌_루틴은_복사할_수_없다() {
        Long owner = register("r7@fitto.com");
        Long copier = register("r8@fitto.com");
        RoutineResponse saved = routineService.save(owner, sample("가슴 루틴"));

        assertThatThrownBy(() -> routineService.copy(copier, saved.id()))
                .isInstanceOf(BusinessException.class);
    }
}
