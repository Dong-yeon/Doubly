package com.fitto.game.repository;

import com.fitto.game.domain.SpotPuzzlePlay;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface SpotPuzzlePlayRepository extends JpaRepository<SpotPuzzlePlay, Long> {

    Optional<SpotPuzzlePlay> findByPuzzleIdAndUserId(Long puzzleId, Long userId);

    List<SpotPuzzlePlay> findByPuzzleId(Long puzzleId);

    List<SpotPuzzlePlay> findByPuzzleIdIn(Collection<Long> puzzleIds);
}
