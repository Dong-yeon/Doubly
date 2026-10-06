package com.fitto.place.repository;

import com.fitto.place.domain.PlaceMenuItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PlaceMenuItemRepository extends JpaRepository<PlaceMenuItem, Long> {

    List<PlaceMenuItem> findByPlaceIdOrderBySortOrderAscIdAsc(Long placeId);

    /** 통째로 바꾸기 — 지우고 새로 넣는다(행 단위 수정이 없다) */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from PlaceMenuItem i where i.placeId = :placeId")
    int deleteAllByPlaceId(@Param("placeId") Long placeId);
}
