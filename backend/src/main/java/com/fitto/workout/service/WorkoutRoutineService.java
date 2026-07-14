package com.fitto.workout.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.WorkoutRoutineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 사용자 본인 운동 루틴 — 저장/조회/삭제. 세션 실행의 기반.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutRoutineService {

    private static final int MAX_ROUTINES = 30;

    private final WorkoutRoutineRepository routineRepository;

    public WorkoutRoutineService(WorkoutRoutineRepository routineRepository) {
        this.routineRepository = routineRepository;
    }

    public List<RoutineResponse> list(Long userId) {
        return routineRepository.findByUserIdOrderByIdDesc(userId).stream()
                .map(RoutineResponse::of)
                .toList();
    }

    public RoutineResponse detail(Long userId, Long routineId) {
        return RoutineResponse.of(getOwned(userId, routineId));
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
        int order = 1;
        for (SaveRoutineRequest.Exercise e : request.exercises()) {
            routine.addExercise(WorkoutRoutineExercise.builder()
                    .exerciseName(e.exerciseName().trim())
                    .category(e.category())
                    .targetSets(e.targetSets())
                    .reps(e.reps())
                    .weightKg(e.weightKg())
                    .orderNo(order++)
                    .build());
        }
        routineRepository.save(routine);
        return RoutineResponse.of(routine);
    }

    @Transactional
    public void delete(Long userId, Long routineId) {
        routineRepository.delete(getOwned(userId, routineId));
    }

    private WorkoutRoutine getOwned(Long userId, Long routineId) {
        return routineRepository.findByIdAndUserId(routineId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "루틴을 찾을 수 없습니다."));
    }
}
