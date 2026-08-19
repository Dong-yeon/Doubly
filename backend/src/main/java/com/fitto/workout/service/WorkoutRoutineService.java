package com.fitto.workout.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.domain.ExerciseCatalog;
import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.domain.WorkoutRoutineExerciseAlternative;
import com.fitto.workout.domain.WorkoutRoutineExerciseSet;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveProgramRequest;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import com.fitto.workout.repository.WorkoutRoutineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 사용자 본인 운동 루틴 — 저장/조회/삭제, 시스템 템플릿 조회·복사. 세션 실행의 기반.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutRoutineService {


    private final WorkoutRoutineRepository routineRepository;
    private final ExerciseCatalogRepository catalogRepository;
    private final PlanGuard planGuard;

    public WorkoutRoutineService(WorkoutRoutineRepository routineRepository,
                                 ExerciseCatalogRepository catalogRepository,
                                 PlanGuard planGuard) {
        this.routineRepository = routineRepository;
        this.catalogRepository = catalogRepository;
        this.planGuard = planGuard;
    }

    public List<RoutineResponse> list(Long userId) {
        return routineRepository.findByUserIdOrderByIdDesc(userId).stream()
                .map(RoutineResponse::of)
                .toList();
    }

    public RoutineResponse detail(Long userId, Long routineId) {
        return RoutineResponse.of(getOwned(userId, routineId));
    }

    /** ⑤ 검증된 분할 템플릿 목록 — 로그인만 하면 누구나 볼 수 있다. */
    public List<RoutineResponse> systemTemplates() {
        return routineRepository.findBySystemTemplateTrueOrderByIdAsc().stream()
                .map(RoutineResponse::of)
                .toList();
    }

    @Transactional
    public RoutineResponse save(Long userId, SaveRoutineRequest request) {
        planGuard.requireCapacity(userId, Feature.WORKOUT_ROUTINE, routineRepository.countByUserId(userId));
        WorkoutRoutine routine = WorkoutRoutine.builder()
                .userId(userId)
                .title(request.title().trim())
                .scheduledDays(request.scheduledDaysOrEmpty())
                .build();
        CatalogLookup catalog = loadCatalog(request.exercises());
        int order = 1;
        for (SaveRoutineRequest.Exercise e : request.exercises()) {
            routine.addExercise(toEntity(e, order++, catalog));
        }
        routineRepository.save(routine);
        return RoutineResponse.of(routine);
    }

    /**
     * 맞춤 프로그램 만들기(짐워크 스타일) — AI가 요일별로 제안한 하루치들을 한 번에 여러
     * 루틴으로 저장한다. 요일 하루당 루틴 하나, 제목은 "{프로그램명} - DayN"(N은 요청에
     * 담긴 순서), scheduledDays 는 그 요일 하나로 자동 배정된다.
     *
     * <p>기존 {@link #save} 를 그대로 반복 호출해 로직을 재사용한다 — 카탈로그 매칭·플랜
     * 용량 체크가 루틴 하나 저장할 때와 동일하게 적용된다. 한 트랜잭션이라 중간에 용량
     * 초과 등으로 실패하면 이미 만든 루틴까지 전부 롤백된다(프로그램이 반쪽만 만들어지지 않게).
     */
    @Transactional
    public List<RoutineResponse> saveProgram(Long userId, SaveProgramRequest request) {
        List<RoutineResponse> saved = new ArrayList<>();
        int dayNo = 1;
        for (SaveProgramRequest.ProgramDay day : request.days()) {
            String title = "%s - Day%d".formatted(request.programTitle().trim(), dayNo);
            SaveRoutineRequest routineRequest =
                    new SaveRoutineRequest(title, day.exercises(), Set.of(day.dayOfWeek()));
            saved.add(save(userId, routineRequest));
            dayNo++;
        }
        return saved;
    }

    /**
     * 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 기존 루틴 템플릿에 반영.
     * 저장(save)과 같은 입력 형식을 그대로 받아 전체 교체한다(부분 수정 아님).
     */
    @Transactional
    public RoutineResponse update(Long userId, Long routineId, SaveRoutineRequest request) {
        WorkoutRoutine routine = getOwned(userId, routineId);
        CatalogLookup catalog = loadCatalog(request.exercises());
        List<WorkoutRoutineExercise> newExercises = new ArrayList<>();
        int order = 1;
        for (SaveRoutineRequest.Exercise e : request.exercises()) {
            newExercises.add(toEntity(e, order++, catalog));
        }
        routine.update(request.title().trim(), newExercises, request.scheduledDaysOrEmpty());
        return RoutineResponse.of(routine);
    }

    /**
     * ⑤ 시스템 템플릿을 내 루틴으로 복사 — 무게는 사람마다 달라 담아오지 않고,
     * 종목 구성·목표 세트/횟수·대체 종목·세트별 목표는 그대로 가져온다(세트의 무게만 비운다).
     * 요일 배정도 담아오지 않는다 — 템플릿 이름이 "Day1"이어도 그걸 실제로 무슨 요일에
     * 할지는 사람마다 다르므로, 복사 직후엔 비워두고 사용자가 직접 고른다.
     */
    @Transactional
    public RoutineResponse copy(Long userId, Long sourceRoutineId) {
        WorkoutRoutine source = routineRepository.findById(sourceRoutineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        if (!source.isSystemTemplate()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "복사할 수 없는 루틴이에요.");
        }
        planGuard.requireCapacity(userId, Feature.WORKOUT_ROUTINE, routineRepository.countByUserId(userId));
        WorkoutRoutine copy = WorkoutRoutine.builder()
                .userId(userId)
                .title(source.getTitle())
                .build();
        for (WorkoutRoutineExercise e : source.getExercises()) {
            WorkoutRoutineExercise copiedExercise = WorkoutRoutineExercise.builder()
                    .exerciseName(e.getExerciseName())
                    .category(e.getCategory())
                    .targetSets(e.getTargetSets())
                    .reps(e.getReps())
                    .weightKg(null)
                    .orderNo(e.getOrderNo())
                    .exerciseCatalogId(e.getExerciseCatalogId())
                    .muscleGroup(e.getMuscleGroup())
                    .equipment(e.getEquipment())
                    .restSeconds(e.getRestSeconds())
                    .build();
            copy.addExercise(copiedExercise);
            for (WorkoutRoutineExerciseAlternative alt : e.getAlternatives()) {
                copiedExercise.addAlternative(WorkoutRoutineExerciseAlternative.builder()
                        .exerciseCatalog(alt.getExerciseCatalog())
                        .sortOrder(alt.getSortOrder())
                        .build());
            }
            for (WorkoutRoutineExerciseSet s : e.getSets()) {
                copiedExercise.addSet(WorkoutRoutineExerciseSet.builder()
                        .setNo(s.getSetNo())
                        .reps(s.getReps())
                        .weightKg(null) // 무게는 개인차가 커서 복사하지 않는다 — 위 exercise 무게와 같은 방침
                        .setType(s.getSetType())
                        .build());
            }
            // recalcSetSummary 는 weightKg 를 세트 중 최댓값으로 다시 계산한다. 세트를 전부
            // 무게 없이 복사했으니 여기서도 null 이 나와 위의 weightKg(null) 방침과 일치한다.
            copiedExercise.recalcSetSummary();
        }
        routineRepository.save(copy);
        return RoutineResponse.of(copy);
    }

    @Transactional
    public void delete(Long userId, Long routineId) {
        routineRepository.delete(getOwned(userId, routineId));
    }

    private WorkoutRoutine getOwned(Long userId, Long routineId) {
        return routineRepository.findByIdAndUserId(routineId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "루틴을 찾을 수 없습니다."));
    }

    /**
     * 요청에 등장하는 카탈로그를 두 갈래로 한 번에 모아 N+1 을 피한다 — 대체 종목은 항상
     * id 로 오고(카탈로그 선택기 전용), 본 종목은 id 가 없을 때만 이름으로 보충 조회한다.
     */
    private CatalogLookup loadCatalog(List<SaveRoutineRequest.Exercise> exercises) {
        List<Long> altIds = exercises.stream()
                .flatMap(e -> e.alternativeExerciseCatalogIds() == null
                        ? java.util.stream.Stream.<Long>empty()
                        : e.alternativeExerciseCatalogIds().stream())
                .distinct()
                .toList();
        Map<Long, ExerciseCatalog> byId = altIds.isEmpty() ? Map.of()
                : catalogRepository.findAllById(altIds).stream()
                        .collect(java.util.stream.Collectors.toMap(ExerciseCatalog::getId, Function.identity()));

        // resolveCatalogByName 안전망 대상 — id 도, muscleGroup 도 없는 종목만 이름으로 찾는다.
        // (카탈로그 선택기를 쓰면 클라이언트가 muscleGroup 을 이미 같이 보내므로 대상에서 빠진다)
        List<String> namesNeedingLookup = exercises.stream()
                .filter(e -> e.exerciseCatalogId() == null && !StringUtils.hasText(e.muscleGroup()))
                .map(e -> e.exerciseName().trim())
                .distinct()
                .toList();
        Map<String, ExerciseCatalog> byName = namesNeedingLookup.isEmpty() ? Map.of()
                : catalogRepository.findByNameIn(namesNeedingLookup).stream()
                        .collect(java.util.stream.Collectors.toMap(ExerciseCatalog::getName, Function.identity()));

        return new CatalogLookup(byId, byName);
    }

    private record CatalogLookup(Map<Long, ExerciseCatalog> byId, Map<String, ExerciseCatalog> byName) {
    }

    /**
     * 본 종목 하나에 쓸 카탈로그를 정한다 — id 가 있으면 그 카탈로그, 없고 muscleGroup 도
     * 없으면 이름이 정확히 일치하는 카탈로그로 자극 부위·기구를 채운다.
     *
     * <p><b>왜 필요한가</b>: 루틴 작성 폼이 예전엔 운동 이름을 자유 텍스트로만 받아 카탈로그와
     * 연결되지 않았다(대체 종목 고를 때만 카탈로그를 썼다). 그래서 세션 중 "대체 종목으로
     * 교체"를 열면 muscleGroup 이 항상 비어 기본값(가슴)으로 고정됐었다. 폼은 이제 카탈로그
     * 선택기를 쓰지만, AI 추천 저장처럼 이름만 보내는 경로가 여전히 있어 안전망으로 남겨둔다.
     * 이미 muscleGroup 이 채워져 왔으면(카탈로그 선택기 경로) 손대지 않는다.
     */
    private ExerciseCatalog resolveCatalogByName(SaveRoutineRequest.Exercise e, CatalogLookup catalog) {
        if (e.exerciseCatalogId() != null) {
            return catalog.byId().get(e.exerciseCatalogId());
        }
        if (StringUtils.hasText(e.muscleGroup())) {
            return null;
        }
        return catalog.byName().get(e.exerciseName().trim());
    }

    private WorkoutRoutineExercise toEntity(SaveRoutineRequest.Exercise e, int order, CatalogLookup catalog) {
        ExerciseCatalog resolved = resolveCatalogByName(e, catalog);
        WorkoutRoutineExercise entity = WorkoutRoutineExercise.builder()
                .exerciseName(e.exerciseName().trim())
                .category(e.category())
                .targetSets(e.targetSets())
                .reps(e.reps())
                .weightKg(e.weightKg())
                .orderNo(order)
                .exerciseCatalogId(resolved != null ? resolved.getId() : e.exerciseCatalogId())
                .muscleGroup(resolved != null ? resolved.getMuscleGroup() : e.muscleGroup())
                .equipment(resolved != null ? resolved.getEquipment() : e.equipment())
                .restSeconds(e.restSeconds())
                .build();

        if (e.alternativeExerciseCatalogIds() != null) {
            int altOrder = 1;
            for (Long catalogId : e.alternativeExerciseCatalogIds()) {
                ExerciseCatalog altCatalog = catalog.byId().get(catalogId);
                if (altCatalog == null) continue; // 존재하지 않는 id는 조용히 무시
                entity.addAlternative(WorkoutRoutineExerciseAlternative.builder()
                        .exerciseCatalog(altCatalog)
                        .sortOrder(altOrder++)
                        .build());
            }
        }

        List<SaveRoutineRequest.SetRequest> requestedSets = e.setsOrEmpty();
        if (!requestedSets.isEmpty()) {
            int setNo = 1;
            for (SaveRoutineRequest.SetRequest s : requestedSets) {
                entity.addSet(WorkoutRoutineExerciseSet.builder()
                        .setNo(setNo++)
                        .reps(s.reps())
                        .weightKg(s.weightKg())
                        .setType(s.setType())
                        .build());
            }
            entity.recalcSetSummary();
        }
        return entity;
    }
}
