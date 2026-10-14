package com.fitto.game.repository;

import com.fitto.game.domain.SpotPuzzleJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** 작업은 넣기만 한다 — 집는 쪽은 Python worker(SKIP LOCKED) */
public interface SpotPuzzleJobRepository extends JpaRepository<SpotPuzzleJob, Long> {

    List<SpotPuzzleJob> findByPuzzleId(Long puzzleId);
}
