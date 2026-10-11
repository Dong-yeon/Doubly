package com.fitto.coupleemoji.repository;

import com.fitto.coupleemoji.domain.CoupleEmoji;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * 삭제(탈퇴·기록 완전 삭제)는 여기 두지 않는다 — {@code RelationRecordPurger} 가 관계 단위 삭제의
 * 단일 출처다(원시 SQL 로 자식→부모 순서 관리). 이 리포지토리의 "삭제"는 전부 숨김({@code deletedAt})이다.
 */
public interface CoupleEmojiRepository extends JpaRepository<CoupleEmoji, Long> {

    /** 트레이 — 살아 있는 것만 최신순(최근 세트가 위) */
    List<CoupleEmoji> findAllByRelationIdAndDeletedAtIsNullOrderByIdDesc(Long relationId);

    /** 채팅 전송 검증·단건 삭제 — 이 관계의, 아직 숨기지 않은 것만 */
    Optional<CoupleEmoji> findByIdAndRelationIdAndDeletedAtIsNull(Long id, Long relationId);

    List<CoupleEmoji> findAllByRelationIdAndBatchIdAndDeletedAtIsNull(Long relationId, String batchId);

    /**
     * 배경 따내기 백필 대상 — 숨긴 이모지도 포함한다. 채팅 메시지는 URL 을 복사해 두므로 숨긴 뒤에도 대화에 그려진다.
     */
    List<CoupleEmoji> findTop20ByBgRemovedIsNullOrderByIdAsc();
}
