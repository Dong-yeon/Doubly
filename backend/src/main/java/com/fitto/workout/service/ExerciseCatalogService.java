package com.fitto.workout.service;

import com.fitto.workout.dto.ExerciseCatalogResponse;
import com.fitto.workout.repository.ExerciseCatalogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

/**
 * 종목 카탈로그 조회 — 자극 부위 필터로 대체 종목 후보(②)를 내려주고,
 * 필터 없이 호출하면 전체 목록(자동완성/시각화 기반)을 내려준다.
 * names 를 넘기면 그 이름들만 정확히 매칭해 내려준다 — 세션 화면이 진행 중인 종목들의
 * TIP(자세 큐)을 한 번에 배치 조회할 때 쓴다(muscleGroup 보다 우선).
 */
@Service
@Transactional(readOnly = true)
public class ExerciseCatalogService {

    private final ExerciseCatalogRepository catalogRepository;

    public ExerciseCatalogService(ExerciseCatalogRepository catalogRepository) {
        this.catalogRepository = catalogRepository;
    }

    public List<ExerciseCatalogResponse> list(String muscleGroup, List<String> names) {
        var rows = names != null && !names.isEmpty()
                ? catalogRepository.findByNameIn(names)
                : StringUtils.hasText(muscleGroup)
                    ? catalogRepository.findByMuscleGroupOrderByName(muscleGroup)
                    : catalogRepository.findAllByOrderByMuscleGroupAscNameAsc();
        return rows.stream().map(ExerciseCatalogResponse::of).toList();
    }
}
