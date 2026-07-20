package com.fitto.auth.repository;

import com.fitto.auth.domain.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {

    /**
     * 사용자의 가장 최근 미사용 코드. 재발급하면 이전 코드는 무효화되므로 실질적으로 1건이지만,
     * 동시 요청 경합에 대비해 최신 1건을 기준으로 검증한다.
     */
    @Query("""
            select t from PasswordResetToken t
            where t.userId = :userId and t.usedAt is null
            order by t.id desc
            """)
    List<PasswordResetToken> findUnusedByUser(@Param("userId") Long userId);

    default Optional<PasswordResetToken> findLatestUnused(Long userId) {
        return findUnusedByUser(userId).stream().findFirst();
    }

    /** 만료분 정리 — 사용 완료됐거나 만료된 코드를 주기적으로 제거한다. */
    @Modifying
    @Query("delete from PasswordResetToken t where t.expiresAt < :before")
    int deleteExpiredBefore(@Param("before") LocalDateTime before);

    /** 회원 탈퇴 시 정리 — users FK 때문에 사용자 삭제 전에 반드시 호출되어야 한다. */
    @Modifying
    @Query("delete from PasswordResetToken t where t.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
