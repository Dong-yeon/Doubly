package com.fitto.challenge.repository;

import com.fitto.challenge.domain.CoupleChallenge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface CoupleChallengeRepository extends JpaRepository<CoupleChallenge, Long> {

    List<CoupleChallenge> findByCoupleIdOrderByStartDateDescIdDesc(Long coupleId);

    Optional<CoupleChallenge> findByIdAndCoupleId(Long id, Long coupleId);
}
