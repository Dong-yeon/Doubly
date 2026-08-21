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

    /**
     * userId 로 시스템 기본 제공(created_by IS NULL) + 내가 만든 커스텀 종목만 걸러낸다 —
     * 이 필터가 없으면 커스텀 종목 기능이 열리는 순간 타인이 만든 종목이 전 유저에게
     * 노출된다(지금은 커스텀 종목 생성 경로가 없어 잠재 버그지만, 필터는 목록 조회 자체의
     * 책임이라 여기서 미리 막아둔다).
     */
    public List<ExerciseCatalogResponse> list(Long userId, String muscleGroup, List<String> names) {
        var rows = names != null && !names.isEmpty()
                ? catalogRepository.findVisibleByNameIn(names, userId)
                : StringUtils.hasText(muscleGroup)
                    ? catalogRepository.findVisibleByMuscleGroup(muscleGroup, userId)
                    : catalogRepository.findVisibleAll(userId);
        return rows.stream().map(ExerciseCatalogResponse::of).toList();
    }
}
