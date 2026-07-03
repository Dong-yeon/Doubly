package com.fitto.trainer.repository;

import com.fitto.trainer.domain.TrainerProfile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TrainerProfileRepository extends JpaRepository<TrainerProfile, Long> {

    Optional<TrainerProfile> findByUserId(Long userId);

    boolean existsByUserId(Long userId);
}
