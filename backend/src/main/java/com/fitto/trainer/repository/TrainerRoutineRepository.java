package com.fitto.trainer.repository;

import com.fitto.trainer.domain.TrainerRoutine;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrainerRoutineRepository extends JpaRepository<TrainerRoutine, Long> {

    /** 회원이 받은 루틴 (최신순) */
    List<TrainerRoutine> findByMemberIdOrderByIdDesc(Long memberId, Pageable pageable);

    /** 트레이너가 특정 회원에게 배정한 루틴 (최신순) */
    List<TrainerRoutine> findByTrainerIdAndMemberIdOrderByIdDesc(Long trainerId, Long memberId, Pageable pageable);
}
