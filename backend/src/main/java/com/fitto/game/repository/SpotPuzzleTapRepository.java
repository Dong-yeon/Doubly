package com.fitto.game.repository;

import com.fitto.game.domain.SpotPuzzleTap;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SpotPuzzleTapRepository extends JpaRepository<SpotPuzzleTap, Long> {

    /** 재전송 판별 — client_tap_id 는 unique 다(V143) */
    Optional<SpotPuzzleTap> findByClientTapId(String clientTapId);
}
