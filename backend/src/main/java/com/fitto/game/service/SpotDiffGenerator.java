package com.fitto.game.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.game.domain.SpotPuzzle;
import com.fitto.game.domain.SpotPuzzleJob;
import com.fitto.game.domain.SpotPuzzleStatus;
import com.fitto.game.repository.SpotPuzzleJobRepository;
import com.fitto.game.repository.SpotPuzzleRepository;
import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 틀린그림찾기 퍼즐 행 + 생성 작업 넣기 — docs/spot-diff-design_2026-10-14.md 2·3절.
 *
 * <p>이미지는 여기서 만들지 않는다. 공유 사진 후보를 골라 작업 행에 싣고 끝이다 — 생성은 Python worker 가 한다
 * (SLIC superpixel·OpenCV 가 필요해서). 후보가 {@link SpotDiffRules#MIN_PHOTOS} 장 미만이면 작업 없이 바로
 * NOT_ENOUGH_PHOTOS. 크기(짧은 변 1000px)는 DB 에 없으므로 worker 가 한 번 더 거른다.
 */
@Service
public class SpotDiffGenerator {

    /** 사진이 모자랐던 오늘 판을 다시 시도하기까지 — 목록을 열 때마다 작업을 쌓지 않게 */
    static final Duration NOT_ENOUGH_RETRY = Duration.ofHours(1);

    private final SpotPuzzleRepository puzzles;
    private final SpotPuzzleJobRepository jobs;
    private final RelationRepository relationRepository;
    private final SpotPhotoSources sources;
    private final ObjectMapper objectMapper;

    public SpotDiffGenerator(SpotPuzzleRepository puzzles, SpotPuzzleJobRepository jobs,
                             RelationRepository relationRepository, SpotPhotoSources sources,
                             ObjectMapper objectMapper) {
        this.puzzles = puzzles;
        this.jobs = jobs;
        this.relationRepository = relationRepository;
        this.sources = sources;
        this.objectMapper = objectMapper;
    }

    /**
     * 그날의 퍼즐 — 없으면 만든다. 관계 행을 잠가 둘이 동시에 열어도 한 판만 생긴다
     * ((couple_id, puzzle_date) UNIQUE 가 마지막 안전장치).
     */
    @Transactional
    public SpotPuzzle ensureDaily(Long coupleId, LocalDate date) {
        Relation couple = lock(coupleId);
        SpotPuzzle existing = puzzles.findByCoupleIdAndPuzzleDate(couple.getId(), date).orElse(null);
        if (existing == null) {
            return create(couple, date);
        }
        if (existing.getStatus() == SpotPuzzleStatus.NOT_ENOUGH_PHOTOS && existing.getUpdatedAt() != null
                && existing.getUpdatedAt().isBefore(LocalDateTime.now().minus(NOT_ENOUGH_RETRY))) {
            enqueue(couple, existing);
        }
        return existing;
    }

    /** 무제한 모드 — 아무도 손대지 않은 판이 없으면 하나 미리 만든다(worker 대기 5분을 사용자가 보지 않게) */
    @Transactional
    public void ensureSpare(Long coupleId) {
        Relation couple = lock(coupleId);
        if (puzzles.countUntouched(couple.getId(), LocalDateTime.now()) == 0) {
            create(couple, null);
        }
    }

    private SpotPuzzle create(Relation couple, LocalDate date) {
        SpotPuzzle puzzle = puzzles.save(new SpotPuzzle(couple.getId(), date, SpotPuzzleStatus.PENDING,
                LocalDateTime.now().plus(SpotDiffRules.LIFETIME)));
        enqueue(couple, puzzle);
        return puzzle;
    }

    /** 후보를 골라 작업을 넣는다 — 모자라면 작업 없이 NOT_ENOUGH_PHOTOS */
    private void enqueue(Relation couple, SpotPuzzle puzzle) {
        LocalDateTime since = LocalDateTime.now().minusDays(SpotDiffRules.PHOTO_REUSE_DAYS);
        List<SpotPhotoSources.Candidate> candidates =
                sources.candidates(couple, new HashSet<>(puzzles.findRecentSourceUrls(couple.getId(), since)));
        if (candidates.size() < SpotDiffRules.MIN_PHOTOS) {
            puzzle.markNotEnoughPhotos(candidates.size(), LocalDateTime.now());
            puzzles.saveAndFlush(puzzle);
            return;
        }
        puzzle.retryPending();
        jobs.save(new SpotPuzzleJob(puzzle.getId(), toJson(candidates), ThreadLocalRandom.current().nextLong(1, 1L << 31)));
    }

    private Relation lock(Long coupleId) {
        return relationRepository.findByIdForUpdate(coupleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
    }

    private String toJson(List<SpotPhotoSources.Candidate> candidates) {
        try {
            return objectMapper.writeValueAsString(candidates.stream()
                    .map(c -> Map.of("type", c.type(), "id", c.id(), "url", c.url()))
                    .toList());
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
