package com.fitto.game.service;

import com.fitto.common.time.KstClock;
import com.fitto.game.domain.SpotPuzzle;
import com.fitto.game.domain.SpotPuzzleStatus;
import com.fitto.game.repository.SpotPuzzleRepository;
import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * 틀린그림찾기 정해진 시각 작업 — docs/spot-diff-design_2026-10-14.md 2절.
 * <ul>
 *   <li><b>KST 0시</b>: 활성 커플마다 오늘 퍼즐 행 + 생성 작업(일일 모드일 때만). worker 가 5분 안에 집는다.</li>
 *   <li><b>매시 5분</b>: 수명이 지난 판 닫기(결과 카드) + 원본 사진이 사라진 판 닫기(A/B 삭제).</li>
 * </ul>
 * 판·커플마다 따로 트랜잭션을 연다({@link SpotDiffService#sweep}, {@link SpotDiffGenerator#ensureDaily}) — 한 곳의 실패가
 * 나머지를 막지 않게. 테스트에서는 스케줄이 꺼져 있어 메서드를 직접 부른다.
 */
@Component
public class SpotDiffScheduler {

    private static final Logger log = LoggerFactory.getLogger(SpotDiffScheduler.class);

    private final SpotDiffGenerator generator;
    private final SpotDiffService service;
    private final SpotPuzzleRepository puzzles;
    private final RelationRepository relationRepository;

    public SpotDiffScheduler(SpotDiffGenerator generator, SpotDiffService service,
                             SpotPuzzleRepository puzzles, RelationRepository relationRepository) {
        this.generator = generator;
        this.service = service;
        this.puzzles = puzzles;
        this.relationRepository = relationRepository;
    }

    @Scheduled(cron = "0 0 0 * * *", zone = "Asia/Seoul")
    public void generateDaily() {
        if (SpotDiffRules.MODE != SpotDiffRules.Mode.DAILY) return;
        LocalDate today = KstClock.today();
        int ok = 0;
        for (Relation couple : relationRepository.findAllActiveCouples()) {
            try {
                generator.ensureDaily(couple.getId(), today);
                ok++;
            } catch (Exception e) {
                log.warn("틀린그림찾기 오늘 퍼즐 준비 실패 couple={}: {}", couple.getId(), e.getMessage());
            }
        }
        log.info("틀린그림찾기 {} 퍼즐 준비 {}커플", today, ok);
    }

    @Scheduled(cron = "0 5 * * * *", zone = "Asia/Seoul")
    public void sweepHourly() {
        int n = sweep();
        if (n > 0) log.info("틀린그림찾기 정리 대상 {}판 확인", n);
    }

    /** @return 확인한 판 수 */
    public int sweep() {
        Set<Long> ids = new LinkedHashSet<>();
        puzzles.findByStatusInAndExpiresAtBefore(EnumSet.of(SpotPuzzleStatus.READY, SpotPuzzleStatus.PENDING),
                LocalDateTime.now()).forEach(p -> ids.add(p.getId()));
        puzzles.findByImageAUrlIsNotNull().stream().map(SpotPuzzle::getId).forEach(ids::add);
        for (Long id : ids) {
            try {
                service.sweep(id);
            } catch (Exception e) {
                log.warn("틀린그림찾기 정리 실패 puzzle={}: {}", id, e.getMessage());
            }
        }
        return ids.size();
    }
}
