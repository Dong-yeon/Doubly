package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.workout.dto.ExerciseCatalogResponse;
import com.fitto.workout.service.ExerciseCatalogService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 종목 카탈로그 API — 자극 부위 태그 기반 대체 종목 후보 / 전체 목록 조회.
 */
@RestController
@RequestMapping("/api/v1/workout/exercise-catalog")
public class ExerciseCatalogController {

    private final ExerciseCatalogService catalogService;

    public ExerciseCatalogController(ExerciseCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    /** muscleGroup 생략 시 전체 목록, 지정 시 같은 자극 부위 종목만(대체 종목 후보). */
    @GetMapping
    public ApiResponse<List<ExerciseCatalogResponse>> list(
            @RequestParam(required = false) String muscleGroup) {
        return ApiResponse.success(catalogService.list(muscleGroup));
    }
}
