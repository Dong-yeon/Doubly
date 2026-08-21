package com.fitto.challenge.repository;

import com.fitto.challenge.domain.CoupleChallenge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface CoupleChallengeRepository extends JpaRepository<CoupleChallenge, Long> {

    List<CoupleChallenge> findByCoupleIdOrderByStartDateDescIdDesc(Long coupleId);

    Optional<CoupleChallenge> findByIdAndCoupleId(Long id, Long coupleId);

    /** 종료 판정 대상 — 기간이 끝났는데 아직 발표되지 않은 대결 (ChallengeSettleNotifier). */
    List<CoupleChallenge> findBySettledAtIsNullAndEndDateBefore(LocalDate date);
}
