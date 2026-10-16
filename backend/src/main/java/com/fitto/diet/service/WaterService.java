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
import com.fitto.common.time.KstClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
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

    /** {@link #add} 의 단계별 쓰기 트랜잭션 */
    private final TransactionTemplate writeTx;
    /** {@link #add} 끝의 요약 조회 — 자기 호출이라 프록시의 readOnly 가 안 걸리므로 직접 연다 */
    private final TransactionTemplate readTx;

    public WaterService(WaterLogRepository waterLogRepository, NutritionGoalRepository nutritionGoalRepository,
                        RelationRepository relationRepository, UserRepository userRepository,
                        PlatformTransactionManager transactionManager) {
        this.waterLogRepository = waterLogRepository;
        this.nutritionGoalRepository = nutritionGoalRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.writeTx = new TransactionTemplate(transactionManager);
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    public WaterSummaryResponse today(Long userId) {
        int consumed = waterLogRepository.findByUserIdAndLogDate(userId, KstClock.today())
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
        int partnerConsumed = waterLogRepository.findByUserIdAndLogDate(partnerId, KstClock.today())
                .map(WaterLog::getAmountMl).orElse(0);
        return new WaterSummaryResponse(consumed, target, true, partnerName, partnerConsumed);
    }

    /**
     * 물 증감 — 동시에 와도 하나도 잃지 않는다(docs/HOME_WATER_TAP_ANALYSIS_2026-10-16.md §3-2).
     *
     * <p>예전엔 행을 읽어 엔티티에 더했다. 동시 요청 둘이 같은 750 을 읽고 둘 다 1000 을 쓰면 250 이 조용히 사라졌고,
     * 그날 첫 두 요청이 겹치면 둘 다 "행 없음"을 보고 INSERT 해 unique(user_id, log_date) 위반으로 500 이 났다.
     * 홈 물컵(탭할 때마다 +250)과 두 기기 동시 사용이 이걸 흔하게 만든다.
     *
     * <p>그래서 ① 원자적 UPDATE ② 행이 없으면 INSERT ③ 그 INSERT 가 동시 도착에 졌으면(unique 위반) 다시 UPDATE.
     * 단계마다 <b>트랜잭션을 따로</b> 연다 — PostgreSQL 은 제약 위반이 난 트랜잭션을 통째로 abort 시켜, 같은 트랜잭션에서
     * 이어지는 UPDATE 가 "current transaction is aborted" 로 실패한다. ON CONFLICT 는 H2 와 함께 못 쓰므로(CLAUDE.md 4절) 쓰지 않는다.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public WaterSummaryResponse add(Long userId, int deltaMl) {
        LocalDate today = KstClock.today();
        Integer updated = writeTx.execute(s -> waterLogRepository.addAmount(userId, today, deltaMl, LocalDateTime.now()));
        if (updated == null || updated == 0) {
            try {
                writeTx.executeWithoutResult(s -> waterLogRepository.saveAndFlush(
                        WaterLog.builder().userId(userId).logDate(today).amountMl(Math.max(0, deltaMl)).build()));
            } catch (DataIntegrityViolationException raced) {
                // 같은 순간 다른 요청이 그날 행을 먼저 만들었다 — 이제 행이 있으니 더하기만 하면 된다
                writeTx.execute(s -> waterLogRepository.addAmount(userId, today, deltaMl, LocalDateTime.now()));
            }
        }
        return readTx.execute(s -> today(userId));
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
