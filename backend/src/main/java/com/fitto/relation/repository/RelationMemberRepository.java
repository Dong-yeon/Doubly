package com.fitto.relation.repository;

import com.fitto.relation.domain.MemberRole;
import com.fitto.relation.domain.RelationMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface RelationMemberRepository extends JpaRepository<RelationMember, Long> {

    List<RelationMember> findByRelationIdOrderByJoinedAtAscIdAsc(Long relationId);

    Optional<RelationMember> findByRelationIdAndUserId(Long relationId, Long userId);

    boolean existsByRelationIdAndUserId(Long relationId, Long userId);

    long countByRelationId(Long relationId);

    long countByRelationIdAndMemberRole(Long relationId, MemberRole memberRole);

    @Modifying
    @Query("delete from RelationMember m where m.relationId = :relationId and m.userId = :userId")
    void deleteByRelationIdAndUserId(@Param("relationId") Long relationId, @Param("userId") Long userId);
}
