package com.fitto.diet.repository;

import com.fitto.diet.domain.FastingSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface FastingSessionRepository extends JpaRepository<FastingSession, Long> {

    Optional<FastingSession> findByUserIdAndEndedAtIsNull(Long userId);

    boolean existsByUserIdAndEndedAtIsNull(Long userId);
}
