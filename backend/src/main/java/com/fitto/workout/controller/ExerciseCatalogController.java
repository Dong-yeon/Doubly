package com.fitto.workout.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.workout.dto.ExerciseCatalogResponse;
import com.fitto.workout.service.ExerciseCatalogService;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.List;

/**
 * 종목 카탈로그 API — 자극 부위 태그 기반 대체 종목 후보 / 전체 목록 / 이름별 배치 조회.
 */
@RestController
@RequestMapping("/api/v1/workout/exercise-catalog")
public class ExerciseCatalogController {

    private final ExerciseCatalogService catalogService;

    public ExerciseCatalogController(ExerciseCatalogService catalogService) {
        this.catalogService = catalogService;
    }

    /**
     * names 가 있으면(콤마 구분) 그 종목들만 정확히 매칭해 내려준다 — 세션 화면이 진행 중인
     * 종목들의 TIP 을 한 번에 조회할 때 사용(muscleGroup 보다 우선). 둘 다 없으면 전체 목록,
     * muscleGroup 만 있으면 같은 자극 부위 종목만(대체 종목 후보).
     */
    @GetMapping
    public ApiResponse<List<ExerciseCatalogResponse>> list(
            @RequestParam(required = false) String muscleGroup,
            @RequestParam(required = false) String names) {
        List<String> nameList = StringUtils.hasText(names)
                ? Arrays.stream(names.split(",")).map(String::trim).filter(StringUtils::hasText).toList()
                : null;
        return ApiResponse.success(catalogService.list(muscleGroup, nameList));
    }
}
