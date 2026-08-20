package com.fitto.workout.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.workout.domain.ExerciseCatalog;
import com.fitto.workout.domain.WorkoutProgram;
import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.domain.WorkoutRoutineExercise;
import com.fitto.workout.domain.WorkoutRoutineExerciseAlternative;
import com.fitto.workout.domain.WorkoutRoutineExerciseSet;
import com.fitto.workout.dto.ProgramResponse;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveProgramRequest;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import com.fitto.workout.repository.WorkoutProgramRepository;
import com.fitto.workout.repository.WorkoutRoutineRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.DayOfWeek;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;

/**
 * 사용자 본인 운동 루틴 — 저장/조회/삭제, 시스템 템플릿 조회·복사, 맞춤 프로그램. 세션 실행의 기반.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutRoutineService {


    private final WorkoutRoutineRepository routineRepository;
    private final WorkoutProgramRepository programRepository;
    private final ExerciseCatalogRepository catalogRepository;
    private final PlanGuard planGuard;

    public WorkoutRoutineService(WorkoutRoutineRepository routineRepository,
                                 WorkoutProgramRepository programRepository,
                                 ExerciseCatalogRepository catalogRepository,
                                 PlanGuard planGuard) {
        this.routineRepository = routineRepository;
        this.programRepository = programRepository;
        this.catalogRepository = catalogRepository;
        this.planGuard = planGuard;
    }

    /** 자유 루틴만 — 프로그램 소속 Day 는 프로그램 카드로 따로 묶여 나가므로 여기 안 섞는다. */
    public List<RoutineResponse> list(Long userId) {
        return routineRepository.findByUserIdAndProgramIsNullOrderByIdDesc(userId).stream()
                .map(RoutineResponse::of)
                .toList();
    }

    public List<ProgramResponse> listPrograms(Long userId) {
        return programRepository.findByUserIdOrderByIdDesc(userId).stream()
                .map(ProgramResponse::of)
                .toList();
    }

    public ProgramResponse programDetail(Long userId, Long programId) {
        return ProgramResponse.of(getOwnedProgram(userId, programId));
    }

    @Transactional
    public void deleteProgram(Long userId, Long programId) {
        programRepository.delete(getOwnedProgram(userId, programId));
    }

    private WorkoutProgram getOwnedProgram(Long userId, Long programId) {
        return programRepository.findByIdAndUserId(programId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "프로그램을 찾을 수 없습니다."));
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
        WorkoutRoutine routine = buildRoutine(userId, request.title().trim(), request.exercises(),
                request.scheduledDaysOrEmpty());
        routineRepository.save(routine);
        return RoutineResponse.of(routine);
    }

    /**
     * 맞춤 프로그램 만들기(짐워크 스타일, 주차 지정) — AI가 요일별로 제안한 하루치들을
     * {@link WorkoutProgram} 하나로 묶어 한 번에 저장한다. 요일 하루당 Day 루틴 하나,
     * 제목은 "{프로그램명} - DayN"(N은 요청에 담긴 순서), scheduledDays 는 그 요일 하나로
     * 자동 배정된다. {@code totalWeeks} 는 Day 구성을 바꾸지 않고 프로그램 메타데이터로만
     * 저장된다(진행률 표시용).
     *
     * <p>플랜 용량은 "완성 후 총 루틴 개수"(기존 개수 + 이번에 만들 Day 수) 전부가 한도
     * 안에 들어오는지 미리 확인한다 — 예전처럼 {@link #save} 를 루프 안에서 반복 호출하며
     * 매번 새로 세지 않고, 한 트랜잭션의 최종 결과 기준으로 한 번에 판단한다(그래도 실패하면
     * {@code @Transactional} 이라 이미 만든 Day 까지 전부 롤백되는 건 기존과 동일).
     */
    @Transactional
    public ProgramResponse saveProgram(Long userId, SaveProgramRequest request) {
        long baseCount = routineRepository.countByUserId(userId);
        for (int i = 0; i < request.days().size(); i++) {
            planGuard.requireCapacity(userId, Feature.WORKOUT_ROUTINE, baseCount + i);
        }

        WorkoutProgram program = WorkoutProgram.builder()
                .userId(userId)
                .title(request.programTitle().trim())
                .totalWeeks(request.totalWeeks())
                .build();
        int dayNo = 1;
        for (SaveProgramRequest.ProgramDay day : request.days()) {
            String title = "%s - Day%d".formatted(request.programTitle().trim(), dayNo);
            WorkoutRoutine routine = buildRoutine(userId, title, day.exercises(), Set.of(day.dayOfWeek()));
            program.addRoutine(routine, dayNo);
            dayNo++;
        }
        programRepository.save(program);
        return ProgramResponse.of(program);
    }

    /** {@link #save}·{@link #saveProgram} 이 공유하는 루틴 조립 로직 — 카탈로그 매칭까지 끝낸, 아직 저장 전인 엔티티를 돌려준다. */
    private WorkoutRoutine buildRoutine(Long userId, String title, List<SaveRoutineRequest.Exercise> exercises,
                                        Set<DayOfWeek> scheduledDays) {
        WorkoutRoutine routine = WorkoutRoutine.builder()
                .userId(userId)
                .title(title)
                .scheduledDays(scheduledDays)
                .build();
        CatalogLookup catalog = loadCatalog(exercises);
        int order = 1;
        for (SaveRoutineRequest.Exercise e : exercises) {
            routine.addExercise(toEntity(e, order++, catalog));
        }
        return routine;
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
        WorkoutRoutine copy = deepCopy(source, userId);
        routineRepository.save(copy);
        return RoutineResponse.of(copy);
    }

    /**
     * 종목·대체 종목·세트별 목표까지 통째로 복제한 새 루틴(미저장)을 만든다. 무게는 개인차가
     * 커서 담지 않는다 — 시스템 템플릿 복사(⑤)와 커플 루틴 선물({@code RoutineGiftService})이
     * 함께 쓰는 핵심 로직이라 여기 하나로 모아둔다. 요일 배정도 담지 않는다(위 copy 방침과 동일).
     * 호출부가 소유자·플랜 한도를 각자의 방식으로 검증한 뒤 부르고, 저장도 호출부가 한다.
     */
    WorkoutRoutine deepCopy(WorkoutRoutine source, Long targetUserId) {
        WorkoutRoutine copy = WorkoutRoutine.builder()
                .userId(targetUserId)
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
        return copy;
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
