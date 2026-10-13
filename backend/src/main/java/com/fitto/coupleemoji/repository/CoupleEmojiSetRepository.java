package com.fitto.coupleemoji.repository;

import com.fitto.coupleemoji.domain.CoupleEmojiSet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 세트 메타. 삭제는 여기 두지 않는다 — {@code RelationRecordPurger} 가 관계 단위 삭제의 단일 출처다.
 */
public interface CoupleEmojiSetRepository extends JpaRepository<CoupleEmojiSet, String> {

    Optional<CoupleEmojiSet> findByBatchIdAndRelationId(String batchId, Long relationId);

    List<CoupleEmojiSet> findAllByBatchIdIn(Collection<String> batchIds);

    /**
     * 다시 그리기 한 번을 쓴다 — 남았을 때만 올리는 <b>조건부 UPDATE 한 줄</b>이라 동시 요청에도 한 번만 이긴다.
     *
     * @return 1 이면 썼다, 0 이면 남은 게 없다
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CoupleEmojiSet s set s.regenUsed = s.regenUsed + 1"
            + " where s.batchId = :batchId and s.regenUsed < s.regenTotal")
    int consumeRegen(@Param("batchId") String batchId);

    /** {@link #consumeRegen} 을 되돌린다 — 다시 그리기가 한 장도 못 남겼을 때. */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CoupleEmojiSet s set s.regenUsed = s.regenUsed - 1"
            + " where s.batchId = :batchId and s.regenUsed > 0")
    int refundRegen(@Param("batchId") String batchId);

    /**
     * 만들다 실패한 장만큼 다시 그리기를 보충한다 — 자동 재시도로도 못 살린 장은 사용자가 그 칸을 다시 그려 채울 수
     * 있어야 한다(docs/EMOJI_12_REGEN_2026-10-13.md §8-D5).
     */
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update CoupleEmojiSet s set s.regenTotal = s.regenTotal + :count where s.batchId = :batchId")
    int addRegen(@Param("batchId") String batchId, @Param("count") int count);
}
