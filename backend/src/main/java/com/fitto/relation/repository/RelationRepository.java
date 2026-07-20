package com.fitto.relation.repository;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RelationRepository extends JpaRepository<Relation, Long> {

    Optional<Relation> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    /** 내가 속한(요청자 또는 수락자) 관계 전체 */
    @Query("select r from Relation r where r.userAId = :userId or r.userBId = :userId")
    List<Relation> findAllByUser(@Param("userId") Long userId);

    /** 내가 속한 특정 유형·상태의 관계 (예: 활성 커플 중복 방지) */
    @Query("""
            select r from Relation r
            where r.relationType = :type and r.status = :status
              and (r.userAId = :userId or r.userBId = :userId)
            """)
    List<Relation> findByUserAndTypeAndStatus(@Param("userId") Long userId,
                                              @Param("type") RelationType type,
                                              @Param("status") RelationStatus status);

    /** 요청자(userA) 기준 특정 유형·상태 관계 수 — 트레이너 회원 정원 체크 */
    @Query("""
            select count(r) from Relation r
            where r.relationType = :type and r.status = :status and r.userAId = :userAId
            """)
    long countByUserAAndTypeAndStatus(@Param("userAId") Long userAId,
                                      @Param("type") RelationType type,
                                      @Param("status") RelationStatus status);

    /**
     * 같은 두 사람 사이의 종료된 커플 관계 — 지난 기록 불러오기 대상 (REL-07).
     * A/B 슬롯 순서는 누가 초대했느냐에 따라 달라지므로 양방향으로 찾는다.
     * 여러 번 만나고 헤어졌다면 가장 최근 것이 앞에 온다.
     */
    @Query("""
            select r from Relation r
            where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
              and r.status = com.fitto.relation.domain.RelationStatus.ENDED
              and ((r.userAId = :one and r.userBId = :other)
                or (r.userAId = :other and r.userBId = :one))
            order by r.id desc
            """)
    List<Relation> findEndedCoupleBetween(@Param("one") Long one, @Param("other") Long other);

    /** 회원 탈퇴 시 본인이 속한 모든 관계 삭제 */
    @Modifying
    @Query("delete from Relation r where r.userAId = :userId or r.userBId = :userId")
    void deleteAllByUser(@Param("userId") Long userId);
}
