package com.fitto.workout.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.domain.ExerciseCatalog;
import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.domain.WorkoutRoutineExerciseAlternative;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import com.fitto.workout.repository.WorkoutRoutineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * 사용자 본인 운동 루틴 — 저장/조회/삭제, 시스템 템플릿 조회·복사. 세션 실행의 기반.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutRoutineService {

    private static final int MAX_ROUTINES = 30;

    private final WorkoutRoutineRepository routineRepository;
    private final ExerciseCatalogRepository catalogRepository;

    public WorkoutRoutineService(WorkoutRoutineRepository routineRepository,
                                 ExerciseCatalogRepository catalogRepository) {
        this.routineRepository = routineRepository;
        this.catalogRepository = catalogRepository;
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
        if (routineRepository.findByUserIdOrderByIdDesc(userId).size() >= MAX_ROUTINES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "루틴은 최대 " + MAX_ROUTINES + "개까지 저장할 수 있어요.");
        }
        WorkoutRoutine routine = WorkoutRoutine.builder()
                .userId(userId)
                .title(request.title().trim())
                .build();
        Map<Long, ExerciseCatalog> catalogById = loadCatalog(request.exercises());
        int order = 1;
        for (SaveRoutineRequest.Exercise e : request.exercises()) {
            routine.addExercise(toEntity(e, order++, catalogById));
        }
        routineRepository.save(routine);
        return RoutineResponse.of(routine);
    }

    /**
     * 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 기존 루틴 템플릿에 반영.
     * 저장(save)과 같은 입력 형식을 그대로 받아 전체 교체한다(부분 수정 아님).
     */
    @Transactional
    public RoutineResponse update(Long userId, Long routineId, SaveRoutineRequest request) {
        WorkoutRoutine routine = getOwned(userId, routineId);
        Map<Long, ExerciseCatalog> catalogById = loadCatalog(request.exercises());
        List<WorkoutRoutineExercise> newExercises = new ArrayList<>();
        int order = 1;
        for (SaveRoutineRequest.Exercise e : request.exercises()) {
            newExercises.add(toEntity(e, order++, catalogById));
        }
        routine.update(request.title().trim(), newExercises);
        return RoutineResponse.of(routine);
    }

    /**
     * ⑤ 시스템 템플릿을 내 루틴으로 복사 — 무게는 사람마다 달라 담아오지 않고,
     * 종목 구성·목표 세트/횟수·대체 종목만 그대로 가져온다.
     */
    @Transactional
    public RoutineResponse copy(Long userId, Long sourceRoutineId) {
        WorkoutRoutine source = routineRepository.findById(sourceRoutineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        if (!source.isSystemTemplate()) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "복사할 수 없는 루틴이에요.");
        }
        if (routineRepository.findByUserIdOrderByIdDesc(userId).size() >= MAX_ROUTINES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "루틴은 최대 " + MAX_ROUTINES + "개까지 저장할 수 있어요.");
        }
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

    /** 요청에 등장하는 대체 종목 카탈로그 id를 한 번에 조회해 N+1 을 피한다. */
    private Map<Long, ExerciseCatalog> loadCatalog(List<SaveRoutineRequest.Exercise> exercises) {
        List<Long> ids = exercises.stream()
                .flatMap(e -> e.alternativeExerciseCatalogIds() == null
                        ? java.util.stream.Stream.<Long>empty()
                        : e.alternativeExerciseCatalogIds().stream())
                .distinct()
                .toList();
        if (ids.isEmpty()) return Map.of();
        return catalogRepository.findAllById(ids).stream()
                .collect(java.util.stream.Collectors.toMap(ExerciseCatalog::getId, Function.identity()));
    }

    private WorkoutRoutineExercise toEntity(SaveRoutineRequest.Exercise e, int order, Map<Long, ExerciseCatalog> catalogById) {
        WorkoutRoutineExercise entity = WorkoutRoutineExercise.builder()
                .exerciseName(e.exerciseName().trim())
                .category(e.category())
                .targetSets(e.targetSets())
                .reps(e.reps())
                .weightKg(e.weightKg())
                .orderNo(order)
                .exerciseCatalogId(e.exerciseCatalogId())
                .muscleGroup(e.muscleGroup())
                .equipment(e.equipment())
                .restSeconds(e.restSeconds())
                .build();
        if (e.alternativeExerciseCatalogIds() != null) {
            int altOrder = 1;
            for (Long catalogId : e.alternativeExerciseCatalogIds()) {
                ExerciseCatalog catalog = catalogById.get(catalogId);
                if (catalog == null) continue; // 존재하지 않는 id는 조용히 무시
                entity.addAlternative(WorkoutRoutineExerciseAlternative.builder()
                        .exerciseCatalog(catalog)
                        .sortOrder(altOrder++)
                        .build());
            }
        }
        return entity;
    }
}
