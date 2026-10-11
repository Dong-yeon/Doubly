package com.fitto.notification.repository;

import com.fitto.notification.domain.DeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, Long> {

    List<DeviceToken> findByUserId(Long userId);

    java.util.Optional<DeviceToken> findByToken(String token);

    /** 이 사용자의 토큰 — 최근 등록 순 */
    List<DeviceToken> findByUserIdOrderByLastRegisteredAtDescIdDesc(Long userId);

    @Modifying
    @Query("delete from DeviceToken d where d.token = :token")
    void deleteByToken(@Param("token") String token);

    /** 이 사용자의 이 토큰만 — 남의 토큰은 지우지 못하게 사용자를 함께 건다(로그아웃용). */
    @Modifying
    @Query("delete from DeviceToken d where d.userId = :userId and d.token = :token")
    int deleteByUserIdAndToken(@Param("userId") Long userId, @Param("token") String token);

    @Modifying
    @Query("delete from DeviceToken d where d.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
