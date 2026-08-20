package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.workout.dto.ProgramResponse;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.dto.SaveProgramRequest;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.service.WorkoutRoutineService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 사용자 본인 운동 루틴 API — 짐앱 스타일 루틴 템플릿.
 */
@RestController
@RequestMapping("/api/v1/workout/routines")
public class WorkoutRoutineController {

    private final WorkoutRoutineService routineService;

    public WorkoutRoutineController(WorkoutRoutineService routineService) {
        this.routineService = routineService;
    }

    @GetMapping
    public ApiResponse<List<RoutineResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(routineService.list(user.id()));
    }

    /** ⑤ 검증된 분할 템플릿 목록 — 로그인만 하면 누구나 조회 가능. */
    @GetMapping("/templates")
    public ApiResponse<List<RoutineResponse>> templates() {
        return ApiResponse.success(routineService.systemTemplates());
    }

    @GetMapping("/{id}")
    public ApiResponse<RoutineResponse> detail(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(routineService.detail(user.id(), id));
    }

    @PostMapping
    public ApiResponse<RoutineResponse> save(@AuthenticationPrincipal AuthUser user,
                                             @Valid @RequestBody SaveRoutineRequest request) {
        return ApiResponse.success(routineService.save(user.id(), request), "루틴을 저장했어요.");
    }

    /** 맞춤 프로그램 만들기(짐워크 스타일, 주차 지정) — AI가 요일별로 제안한 하루치들을 프로그램 하나로 묶어 저장. */
    @PostMapping("/program")
    public ApiResponse<ProgramResponse> saveProgram(@AuthenticationPrincipal AuthUser user,
                                                     @Valid @RequestBody SaveProgramRequest request) {
        return ApiResponse.success(routineService.saveProgram(user.id(), request),
                "%d개 루틴으로 프로그램을 저장했어요.".formatted(request.days().size()));
    }

    /** 내 프로그램 목록 — "내 루틴" 화면의 프로그램 카드용(Day 는 여기 안 실린다, 상세에서 조회). */
    @GetMapping("/programs")
    public ApiResponse<List<ProgramResponse>> listPrograms(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(routineService.listPrograms(user.id()));
    }

    /** 프로그램 상세 — Day 목록 포함. Day 선택 화면이 이걸로 그린다. */
    @GetMapping("/programs/{id}")
    public ApiResponse<ProgramResponse> programDetail(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(routineService.programDetail(user.id(), id));
    }

    /** 프로그램 삭제 — 소속 Day 루틴도 함께 지워진다. */
    @DeleteMapping("/programs/{id}")
    public ApiResponse<Void> deleteProgram(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        routineService.deleteProgram(user.id(), id);
        return ApiResponse.success(null, "프로그램을 삭제했어요.");
    }

    /** 스마트 루틴 동기화(Save-on-Finish) — 세션에서 바뀐 구성을 이 루틴에 반영. */
    @PatchMapping("/{id}")
    public ApiResponse<RoutineResponse> update(@AuthenticationPrincipal AuthUser user, @PathVariable Long id,
                                               @Valid @RequestBody SaveRoutineRequest request) {
        return ApiResponse.success(routineService.update(user.id(), id, request), "루틴에 반영했어요.");
    }

    /** ⑤ 시스템 템플릿을 내 루틴으로 복사. */
    @PostMapping("/{id}/copy")
    public ApiResponse<RoutineResponse> copy(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        return ApiResponse.success(routineService.copy(user.id(), id), "루틴을 복사했어요.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        routineService.delete(user.id(), id);
        return ApiResponse.success(null, "루틴을 삭제했어요.");
    }
}
