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
     * 이 사람들 중 <b>가장 늦게</b> 가입한 시각 — 가입 후 N일 체험의 종료 시점 계산에 쓴다
     * ({@code PlanResolver}). 커플이면 나중에 들어온 사람 기준이라야 "둘 중 높은 등급"
     * 규칙과 어긋나지 않는다.
     *
     * <p>{@code created_at} 은 JVM 기본 TZ 의 벽시계로 저장되므로 같은 JVM 의
     * {@code LocalDateTime.now()} 와 비교해야 한다(아래 findSoloJoinedBetween 주석 참고).
     *
     * <p>비어 있는 목록이나 없는 id 에는 {@code null} 이 온다 — 집계 함수라 행이 없어도
     * 한 행(널)이 나온다.
     */
    @Query("select max(u.createdAt) from User u where u.id in :ids")
    LocalDateTime findLatestCreatedAt(@Param("ids") List<Long> ids);

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
