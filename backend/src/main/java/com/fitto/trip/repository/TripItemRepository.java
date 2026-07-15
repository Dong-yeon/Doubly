package com.fitto.trip.repository;

import com.fitto.trip.domain.TripItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TripItemRepository extends JpaRepository<TripItem, Long> {

    /** 일정 항목 — Day → 하루 안 순서 → id 순 */
    List<TripItem> findByTripIdOrderByDayNoAscSortOrderAscIdAsc(Long tripId);

    /** 특정 Day 의 다음 정렬 순서 계산용 */
    List<TripItem> findByTripIdAndDayNo(Long tripId, int dayNo);

    long countByTripId(Long tripId);

    /**
     * 여행의 일정 전체 삭제 — AI 일정 생성 시 기존 일정을 대체한다.
     * 벌크 DELETE 로 즉시 실행해, 이어지는 saveAll(INSERT)이 삭제보다 뒤에 오도록 순서를 보장한다.
     */
    @Modifying(flushAutomatically = true)
    @Query("delete from TripItem t where t.tripId = :tripId")
    void deleteByTripId(@Param("tripId") Long tripId);
}
