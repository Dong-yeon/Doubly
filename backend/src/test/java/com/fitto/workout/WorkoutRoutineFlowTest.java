package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.workout.dto.ProgramResponse;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveProgramRequest;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.DayOfWeek;
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
    @Autowired
    com.fitto.workout.repository.WorkoutRoutineRepository routineRepository;

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
    void 시스템_템플릿은_마이그레이션_백필로_자극_부위가_채워져_있다() {
        // V38 백필 전에는 시드(V30)가 muscle_group 을 안 넣어 세션 대체 종목 후보 조회가
        // 항상 비어 있었다(WorkoutSessionScreen.openSubstitute 참고).
        RoutineResponse template = routineService.systemTemplates().stream()
                .filter(t -> t.title().contains("3분할 Day1"))
                .findFirst().orElseThrow();

        assertThat(template.exercises()).isNotEmpty();
        assertThat(template.exercises()).allMatch(e -> e.muscleGroup() != null);
        assertThat(template.exercises().get(0).exerciseCatalogId()).isNotNull();
    }

    @Test
    void 카탈로그_id_없이_이름만_보내면_자극_부위가_자동으로_채워진다() {
        Long user = register("r9@fitto.com");

        // muscleGroup·exerciseCatalogId 둘 다 생략 — 카탈로그와 이름이 정확히 같은 "스쿼트"
        RoutineResponse saved = routineService.save(user, new SaveRoutineRequest("하체 루틴", List.of(
                new SaveRoutineRequest.Exercise("스쿼트", "근력", 4, 8, null, null, null, null))));

        var exercise = saved.exercises().get(0);
        assertThat(exercise.muscleGroup()).isEqualTo("하체");
        assertThat(exercise.equipment()).isEqualTo("바벨");
        assertThat(exercise.exerciseCatalogId()).isNotNull();
    }

    @Test
    void 카탈로그에_없는_이름은_자극_부위가_비워진_채로_저장된다() {
        Long user = register("r10@fitto.com");

        RoutineResponse saved = routineService.save(user, new SaveRoutineRequest("커스텀 루틴", List.of(
                new SaveRoutineRequest.Exercise("나만의 특수 운동", "근력", 3, 10, null, null, null, null))));

        assertThat(saved.exercises().get(0).muscleGroup()).isNull();
        assertThat(saved.exercises().get(0).exerciseCatalogId()).isNull();
    }

    @Test
    void 세트별_목표를_저장하면_요약이_세트에서_다시_계산된다() {
        Long user = register("r11@fitto.com");

        // 탑세트(1×5×100kg) + 백오프(3×5×80kg) — 종목 하나에 무게가 다른 세트 4개
        RoutineResponse saved = routineService.save(user, new SaveRoutineRequest("가슴 루틴", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", null, null, null, null, "가슴", "바벨",
                        null, null, List.of(
                                new SaveRoutineRequest.SetRequest(5, java.math.BigDecimal.valueOf(100), "TOP"),
                                new SaveRoutineRequest.SetRequest(5, java.math.BigDecimal.valueOf(80), "BACKOFF"),
                                new SaveRoutineRequest.SetRequest(5, java.math.BigDecimal.valueOf(80), "BACKOFF"),
                                new SaveRoutineRequest.SetRequest(5, java.math.BigDecimal.valueOf(80), "BACKOFF"))))));

        var exercise = saved.exercises().get(0);
        assertThat(exercise.sets()).hasSize(4);
        assertThat(exercise.sets().get(0).setType()).isEqualTo("TOP");
        assertThat(exercise.sets().get(0).weightKg()).isEqualByComparingTo("100");
        // 요약: 4세트 · 5회(전부 동일) · 최댓값 100kg(탑세트)
        assertThat(exercise.targetSets()).isEqualTo(4);
        assertThat(exercise.reps()).isEqualTo(5);
        assertThat(exercise.weightKg()).isEqualByComparingTo("100");
    }

    @Test
    void 세트가_없으면_기존처럼_종목_단위_요약값을_그대로_쓴다() {
        Long user = register("r12@fitto.com");

        RoutineResponse saved = routineService.save(user, sample("가슴 루틴"));

        assertThat(saved.exercises().get(0).sets()).isEmpty();
        assertThat(saved.exercises().get(0).targetSets()).isEqualTo(3);
    }

    @Test
    void 스마트_동기화로_세트별_목표를_교체하면_요약도_다시_계산된다() {
        Long user = register("r13@fitto.com");
        RoutineResponse saved = routineService.save(user, sample("가슴 루틴"));

        RoutineResponse updated = routineService.update(user, saved.id(), new SaveRoutineRequest("가슴 루틴", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", null, null, null, null, "가슴", "바벨",
                        null, null, List.of(
                                new SaveRoutineRequest.SetRequest(10, java.math.BigDecimal.valueOf(40), null),
                                new SaveRoutineRequest.SetRequest(8, java.math.BigDecimal.valueOf(50), null))))));

        assertThat(updated.exercises().get(0).sets()).hasSize(2);
        assertThat(updated.exercises().get(0).targetSets()).isEqualTo(2);
        assertThat(updated.exercises().get(0).weightKg()).isEqualByComparingTo("50");
    }

    @Test
    void 요일을_배정해_루틴을_저장하면_월요일_순으로_정렬돼_돌아온다() {
        Long user = register("r16@fitto.com");

        RoutineResponse saved = routineService.save(user, new SaveRoutineRequest("Day1", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨")),
                java.util.Set.of(java.time.DayOfWeek.THURSDAY, java.time.DayOfWeek.MONDAY)));

        // 저장 순서(목,월)와 무관하게 월→일 순으로 정렬된다
        assertThat(saved.scheduledDays())
                .containsExactly(java.time.DayOfWeek.MONDAY, java.time.DayOfWeek.THURSDAY);
    }

    @Test
    void 요일_없이_저장하면_지금까지처럼_빈_목록이다() {
        Long user = register("r17@fitto.com");

        RoutineResponse saved = routineService.save(user, sample("가슴 루틴"));

        assertThat(saved.scheduledDays()).isEmpty();
    }

    @Test
    void 스마트_동기화로_요일_배정을_바꿀_수_있다() {
        Long user = register("r18@fitto.com");
        RoutineResponse saved = routineService.save(user, new SaveRoutineRequest("Day1", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨")),
                java.util.Set.of(java.time.DayOfWeek.MONDAY)));

        RoutineResponse updated = routineService.update(user, saved.id(), new SaveRoutineRequest("Day1", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨")),
                java.util.Set.of(java.time.DayOfWeek.TUESDAY, java.time.DayOfWeek.FRIDAY)));

        assertThat(updated.scheduledDays())
                .containsExactly(java.time.DayOfWeek.TUESDAY, java.time.DayOfWeek.FRIDAY);
        // 재조회해도 유지된다
        assertThat(routineService.detail(user, saved.id()).scheduledDays())
                .containsExactly(java.time.DayOfWeek.TUESDAY, java.time.DayOfWeek.FRIDAY);
    }

    @Test
    void 같은_요일에_루틴_두_개를_배정해도_막지_않는다() {
        Long user = register("r19@fitto.com");

        routineService.save(user, new SaveRoutineRequest("Day1", List.of(
                new SaveRoutineRequest.Exercise("벤치프레스", "근력", 3, 10, null, null, "가슴", "바벨")),
                java.util.Set.of(java.time.DayOfWeek.MONDAY)));
        RoutineResponse second = routineService.save(user, new SaveRoutineRequest("Day1 대체", List.of(
                new SaveRoutineRequest.Exercise("스쿼트", "근력", 3, 10, null, null, "하체", "바벨")),
                java.util.Set.of(java.time.DayOfWeek.MONDAY)));

        assertThat(second.scheduledDays()).containsExactly(java.time.DayOfWeek.MONDAY);
        assertThat(routineService.list(user).stream()
                .filter(r -> r.scheduledDays().contains(java.time.DayOfWeek.MONDAY)))
                .hasSize(2);
    }

    @Test
    void 시스템_템플릿을_복사하면_요일_배정은_비워진_채로_시작한다() {
        Long user = register("r20@fitto.com");
        RoutineResponse template = routineService.systemTemplates().stream()
                .filter(t -> t.title().contains("20분 전신"))
                .findFirst().orElseThrow();

        RoutineResponse copied = routineService.copy(user, template.id());

        // 템플릿 이름이 "Day1" 이어도 실제 요일은 개인 일정이라 복사 시 가져오지 않는다
        assertThat(copied.scheduledDays()).isEmpty();
    }

    @Test
    void 시스템_템플릿_목록의_요일_배정은_항상_비어있다() {
        List<RoutineResponse> templates = routineService.systemTemplates();

        assertThat(templates).allMatch(t -> t.scheduledDays().isEmpty());
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
    void 세트별_목표가_있는_시스템_템플릿을_복사하면_세트_구성은_오되_무게는_비워진다() {
        // 시스템 템플릿은 관리자만 만들 수 있어 SaveRoutineRequest 경로가 아니라 시드와
        // 같은 방식(엔티티 직접 구성)으로 세트 있는 템플릿을 준비한다.
        var template = com.fitto.workout.domain.WorkoutRoutine.builder()
                .userId(null).title("테스트 템플릿").systemTemplate(true).build();
        var exercise = com.fitto.workout.domain.WorkoutRoutineExercise.builder()
                .exerciseName("벤치프레스").category("근력").orderNo(1).build();
        template.addExercise(exercise);
        exercise.addSet(com.fitto.workout.domain.WorkoutRoutineExerciseSet.builder()
                .setNo(1).reps(5).weightKg(java.math.BigDecimal.valueOf(100)).setType("TOP").build());
        exercise.addSet(com.fitto.workout.domain.WorkoutRoutineExerciseSet.builder()
                .setNo(2).reps(5).weightKg(java.math.BigDecimal.valueOf(80)).setType("BACKOFF").build());
        exercise.recalcSetSummary();
        routineRepository.save(template);

        Long copier = register("r14@fitto.com");
        RoutineResponse copied = routineService.copy(copier, template.getId());

        var copiedExercise = copied.exercises().get(0);
        assertThat(copiedExercise.sets()).hasSize(2);
        assertThat(copiedExercise.sets()).extracting(RoutineResponse.SetSummary::setType)
                .containsExactly("TOP", "BACKOFF");
        // 무게는 개인차가 커서 세트도, 요약값도 비운다
        assertThat(copiedExercise.sets()).allMatch(s -> s.weightKg() == null);
        assertThat(copiedExercise.weightKg()).isNull();
        assertThat(copiedExercise.targetSets()).isEqualTo(2);
        assertThat(copiedExercise.reps()).isEqualTo(5);
    }

    @Test
    void 시스템_템플릿이_아닌_루틴은_복사할_수_없다() {
        Long owner = register("r7@fitto.com");
        Long copier = register("r8@fitto.com");
        RoutineResponse saved = routineService.save(owner, sample("가슴 루틴"));

        assertThatThrownBy(() -> routineService.copy(copier, saved.id()))
                .isInstanceOf(BusinessException.class);
    }

    // ---- 맞춤 프로그램(주차 지정, Day 그룹핑) ----

    private SaveProgramRequest.ProgramDay day(DayOfWeek dow, String exerciseName, String muscleGroup) {
        return new SaveProgramRequest.ProgramDay(dow, List.of(
                new SaveRoutineRequest.Exercise(exerciseName, "근력", 3, 10, null, null, muscleGroup, "바벨")));
    }

    @Test
    void 프로그램을_저장하면_요일_수만큼_Day가_생기고_주차가_저장된다() {
        Long user = register("p1@fitto.com");

        ProgramResponse saved = routineService.saveProgram(user, new SaveProgramRequest(
                "전신 밸런스 프로그램", 8, List.of(
                        day(DayOfWeek.MONDAY, "벤치프레스", "가슴"),
                        day(DayOfWeek.WEDNESDAY, "데드리프트", "등"),
                        day(DayOfWeek.FRIDAY, "스쿼트", "하체"))));

        assertThat(saved.id()).isNotNull();
        assertThat(saved.totalWeeks()).isEqualTo(8);
        assertThat(saved.days()).hasSize(3);
        assertThat(saved.days()).extracting(ProgramResponse.ProgramDay::dayNo).containsExactly(1, 2, 3);
        assertThat(saved.days().get(0).routine().title()).isEqualTo("전신 밸런스 프로그램 - Day1");
        assertThat(saved.days().get(1).routine().scheduledDays()).containsExactly(DayOfWeek.WEDNESDAY);
    }

    @Test
    void 프로그램의_Day_루틴은_내_루틴_목록에_안_보인다() {
        Long user = register("p2@fitto.com");
        routineService.save(user, sample("자유 루틴"));
        routineService.saveProgram(user, new SaveProgramRequest("프로그램", 4, List.of(
                day(DayOfWeek.MONDAY, "벤치프레스", "가슴"),
                day(DayOfWeek.THURSDAY, "스쿼트", "하체"))));

        List<RoutineResponse> myRoutines = routineService.list(user);

        // 프로그램 소속 Day 2개는 빠지고, 자유 루틴 1개만 남는다
        assertThat(myRoutines).hasSize(1);
        assertThat(myRoutines.get(0).title()).isEqualTo("자유 루틴");
    }

    @Test
    void 내_프로그램_목록과_상세를_조회한다() {
        Long user = register("p3@fitto.com");
        ProgramResponse saved = routineService.saveProgram(user, new SaveProgramRequest("프로그램", 12, List.of(
                day(DayOfWeek.TUESDAY, "벤치프레스", "가슴"))));

        List<ProgramResponse> programs = routineService.listPrograms(user);
        assertThat(programs).hasSize(1);
        assertThat(programs.get(0).id()).isEqualTo(saved.id());

        ProgramResponse detail = routineService.programDetail(user, saved.id());
        assertThat(detail.totalWeeks()).isEqualTo(12);
        assertThat(detail.days()).hasSize(1);
    }

    @Test
    void 남의_프로그램은_조회할_수_없다() {
        Long owner = register("p4@fitto.com");
        Long other = register("p5@fitto.com");
        ProgramResponse saved = routineService.saveProgram(owner, new SaveProgramRequest("프로그램", 4, List.of(
                day(DayOfWeek.MONDAY, "벤치프레스", "가슴"))));

        assertThatThrownBy(() -> routineService.programDetail(other, saved.id()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 프로그램을_삭제하면_소속_Day도_함께_지워진다() {
        Long user = register("p6@fitto.com");
        ProgramResponse saved = routineService.saveProgram(user, new SaveProgramRequest("프로그램", 4, List.of(
                day(DayOfWeek.MONDAY, "벤치프레스", "가슴"),
                day(DayOfWeek.THURSDAY, "스쿼트", "하체"))));
        Long dayRoutineId = saved.days().get(0).routine().id();

        routineService.deleteProgram(user, saved.id());

        assertThatThrownBy(() -> routineService.programDetail(user, saved.id()))
                .isInstanceOf(BusinessException.class);
        assertThat(routineRepository.findById(dayRoutineId)).isEmpty();
    }
}
