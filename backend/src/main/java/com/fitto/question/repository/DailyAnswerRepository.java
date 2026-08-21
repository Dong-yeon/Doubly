package com.fitto.question.repository;

import com.fitto.question.domain.DailyAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface DailyAnswerRepository extends JpaRepository<DailyAnswer, Long> {

    List<DailyAnswer> findByCoupleIdAndQuestionDate(Long coupleId, LocalDate questionDate);

    Optional<DailyAnswer> findByCoupleIdAndQuestionDateAndUserId(Long coupleId, LocalDate questionDate, Long userId);

    /** 히스토리 — 최근 답변부터 (양쪽 답변 여부는 서비스에서 판별) */
    List<DailyAnswer> findByCoupleIdOrderByQuestionDateDesc(Long coupleId);

    /** 특정 날짜에 이미 답한 사용자 id 전체 — 오늘의 질문 미답변 리마인드가 대상을 거를 때 쓴다. */
    @Query("select a.userId from DailyAnswer a where a.questionDate = :date")
    List<Long> findAnsweredUserIdsOn(@Param("date") LocalDate date);
}
