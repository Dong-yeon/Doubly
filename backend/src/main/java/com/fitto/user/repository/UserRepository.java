package com.fitto.user.repository;

import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /** 소셜 로그인 — 제공자 + 제공자측 사용자 id 로 조회 */
    Optional<User> findBySocialTypeAndSocialId(SocialType socialType, String socialId);

    /**
     * 아직 커플을 연결하지 않은 채 이 구간에 가입한 사용자 — 초대 유도 리마인드 대상.
     *
     * <p>구간을 날짜가 아니라 <b>{@code LocalDateTime.now()} 로부터의 상대 오프셋</b>으로
     * 받는 이유: {@code created_at} 은 JVM 기본 TZ 의 벽시계로 저장되는데(운영은 UTC,
     * 로컬은 KST — {@code MemoryDates} 주석 참고) 같은 JVM 의 now() 와 비교하면
     * TZ 가 무엇이든 "몇 시간 전" 계산이 일치한다.
     */
    @Query("""
            select u from User u
            where u.createdAt >= :from and u.createdAt < :to
              and not exists (
                select 1 from Relation r
                where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
                  and r.status = com.fitto.relation.domain.RelationStatus.ACTIVE
                  and (r.userAId = u.id or r.userBId = u.id))
            """)
    List<User> findSoloJoinedBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
