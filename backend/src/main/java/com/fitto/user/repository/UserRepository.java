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
     * 가입은 했지만 커플 관계가 <b>전혀</b> 없는 사용자(D+1·D+3 프리뷰 리마인드 대상).
     * ACTIVE 뿐 아니라 PENDING(초대 코드만 만든 상태)도 제외한다 — 이미 초대해 둔
     * 사람에게 "함께하면 열려요"는 어색하다.
     */
    @Query("""
            select u from User u
            where u.createdAt >= :from and u.createdAt < :to
              and not exists (
                select 1 from Relation r
                where r.relationType = com.fitto.relation.domain.RelationType.COUPLE
                  and (r.userAId = u.id or r.userBId = u.id))
            """)
    List<User> findSoloUsersJoinedBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
