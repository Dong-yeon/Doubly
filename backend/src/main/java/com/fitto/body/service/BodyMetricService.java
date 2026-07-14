package com.fitto.body.service;

import com.fitto.body.domain.BodyMetric;
import com.fitto.body.dto.BodyMetricResponse;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.repository.BodyMetricRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 신체 측정 & 진행 사진 — 저장/조회(그래프)/삭제. 사용자별.
 */
@Service
@Transactional(readOnly = true)
public class BodyMetricService {

    private final BodyMetricRepository repository;

    public BodyMetricService(BodyMetricRepository repository) {
        this.repository = repository;
    }

    /** 시간순(오래된→최신) — 그래프용 */
    public List<BodyMetricResponse> list(Long userId) {
        return repository.findByUserIdOrderByMeasuredDateAscIdAsc(userId).stream()
                .map(BodyMetricResponse::of)
                .toList();
    }

    @Transactional
    public BodyMetricResponse save(Long userId, SaveBodyMetricRequest req) {
        if (req.weightKg() == null && req.bodyFatPct() == null && req.waistCm() == null
                && (req.photoUrl() == null || req.photoUrl().isBlank())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "측정값이나 사진을 하나 이상 입력해주세요.");
        }
        BodyMetric metric = BodyMetric.builder()
                .userId(userId)
                .measuredDate(req.measuredDate())
                .weightKg(req.weightKg())
                .bodyFatPct(req.bodyFatPct())
                .waistCm(req.waistCm())
                .photoUrl(req.photoUrl())
                .memo(req.memo())
                .build();
        repository.save(metric);
        return BodyMetricResponse.of(metric);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        BodyMetric metric = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "측정 기록을 찾을 수 없습니다."));
        repository.delete(metric);
    }
}
