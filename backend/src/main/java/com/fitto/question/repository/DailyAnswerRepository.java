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

    /** 최근에 오늘의 질문을 써본 커플인지 — 안 쓰는 커플에게 매일 리마인드하지 않기 위한 판정 */
    boolean existsByCoupleIdAndQuestionDateGreaterThanEqual(Long coupleId, LocalDate from);

    /**
     * 답을 기다리는 지난 질문 — {@code partnerId} 는 답했고 {@code userId} 는 답하지 않은,
     * {@code before} 이전 날짜의 상대 답변 행(최근순). 오늘 것은 오늘의 질문 카드가 맡는다.
     * (couple_id, question_date, user_id) 유니크 인덱스를 그대로 탄다.
     */
    @Query("""
            select a from DailyAnswer a
            where a.coupleId = :coupleId
              and a.userId = :partnerId
              and a.questionDate < :before
              and not exists (
                  select 1 from DailyAnswer m
                  where m.coupleId = a.coupleId
                    and m.questionDate = a.questionDate
                    and m.userId = :userId)
            order by a.questionDate desc
            """)
    List<DailyAnswer> findAwaitingAnswer(@Param("coupleId") Long coupleId,
                                         @Param("partnerId") Long partnerId,
                                         @Param("userId") Long userId,
                                         @Param("before") LocalDate before);

    /** 히스토리 — 최근 답변부터 (양쪽 답변 여부는 서비스에서 판별) */
    List<DailyAnswer> findByCoupleIdOrderByQuestionDateDesc(Long coupleId);
}
