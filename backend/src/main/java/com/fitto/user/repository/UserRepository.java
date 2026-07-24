package com.fitto.user.repository;

import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /** 소셜 로그인 — 제공자 + 제공자측 사용자 id 로 조회 */
    Optional<User> findBySocialTypeAndSocialId(SocialType socialType, String socialId);
}
