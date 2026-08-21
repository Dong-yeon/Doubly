package com.fitto.question.repository;

import com.fitto.question.domain.DailyAnswer;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailyAnswerRepository extends JpaRepository<DailyAnswer, Long> {

    List<DailyAnswer> findByCoupleIdAndQuestionDate(Long coupleId, LocalDate questionDate);

    Optional<DailyAnswer> findByCoupleIdAndQuestionDateAndUserId(Long coupleId, LocalDate questionDate, Long userId);

    /** 최근에 오늘의 질문을 써본 커플인지 — 안 쓰는 커플에게 매일 리마인드하지 않기 위한 판정 */
    boolean existsByCoupleIdAndQuestionDateGreaterThanEqual(Long coupleId, LocalDate from);

    /** 히스토리 — 최근 답변부터 (양쪽 답변 여부는 서비스에서 판별) */
    List<DailyAnswer> findByCoupleIdOrderByQuestionDateDesc(Long coupleId);
}
