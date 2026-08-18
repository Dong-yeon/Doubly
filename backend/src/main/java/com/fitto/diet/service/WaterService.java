package com.fitto.diet.service;

import com.fitto.diet.domain.NutritionGoal;
import com.fitto.diet.domain.WaterLog;
import com.fitto.diet.dto.WaterSummaryResponse;
import com.fitto.diet.repository.NutritionGoalRepository;
import com.fitto.diet.repository.WaterLogRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * 물 섭취 트래커 — 날짜별 누적치 하나에 +250ml 버튼으로 증분한다.
 * 원가가 없는 단순 카운터라 플랜 제한을 두지 않는다({@link com.fitto.common.plan.Feature} 미사용,
 * YAZIO 도 물 트래커는 무료다). 커플이 연결돼 있으면 상대방의 오늘 섭취량도 함께 보여준다.
 */
@Service
@Transactional(readOnly = true)
public class WaterService {

    /** 목표를 정하지 않았을 때의 기본값 — 성인 하루 권장 섭취량 근사치 */
    private static final int DEFAULT_TARGET_ML = 2000;

    private final WaterLogRepository waterLogRepository;
    private final NutritionGoalRepository nutritionGoalRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;

    public WaterService(WaterLogRepository waterLogRepository, NutritionGoalRepository nutritionGoalRepository,
                        RelationRepository relationRepository, UserRepository userRepository) {
        this.waterLogRepository = waterLogRepository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
    }

    public WaterSummaryResponse today(Long userId) {
        int consumed = waterLogRepository.findByUserIdAndLogDate(userId, LocalDate.now())
                .map(WaterLog::getAmountMl).orElse(0);
        int target = nutritionGoalRepository.findById(userId)
                .map(NutritionGoal::getTargetWaterMl)
                .orElse(DEFAULT_TARGET_ML);

        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return new WaterSummaryResponse(consumed, target, false, null, null);
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return new WaterSummaryResponse(consumed, target, false, null, null);
        }
        String partnerName = userRepository.findById(partnerId).map(u -> u.getName()).orElse(null);
        int partnerConsumed = waterLogRepository.findByUserIdAndLogDate(partnerId, LocalDate.now())
                .map(WaterLog::getAmountMl).orElse(0);
        return new WaterSummaryResponse(consumed, target, true, partnerName, partnerConsumed);
    }

    @Transactional
    public WaterSummaryResponse add(Long userId, int deltaMl) {
        LocalDate today = LocalDate.now();
        WaterLog log = waterLogRepository.findByUserIdAndLogDate(userId, today)
                .orElseGet(() -> waterLogRepository.save(
                        WaterLog.builder().userId(userId).logDate(today).amountMl(0).build()));
        log.add(deltaMl);
        return today(userId);
    }

    @Transactional
    public WaterSummaryResponse setGoal(Long userId, Integer targetMl) {
        NutritionGoal goal = nutritionGoalRepository.findById(userId)
                .orElseGet(() -> new NutritionGoal(userId));
        goal.updateWaterGoal(targetMl);
        nutritionGoalRepository.save(goal);
        return today(userId);
    }
}
