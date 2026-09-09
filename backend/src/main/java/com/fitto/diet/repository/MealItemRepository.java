package com.fitto.diet.repository;

import com.fitto.diet.domain.MealItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface MealItemRepository extends JpaRepository<MealItem, Long> {

    /** 이 사용자의 음식 항목을 최근 기록순으로 — "최근 먹은 음식" 집계용 */
    @Query("""
            select i from MealItem i join fetch i.meal m
            where m.userId = :userId
            order by m.createdAt desc, i.id desc
            """)
    List<MealItem> findRecentByUser(@Param("userId") Long userId, Pageable pageable);

    /**
     * 이 사용자가 과거에 기록한 음식 항목 중 <b>칼로리가 있는</b> 것만, 이름(소문자·trim)이
     * 주어진 목록에 들어 있는 것을 최근 기록순으로. 호출자가 이름별 첫 건을 대표값으로 고른다.
     * 이름 비교는 소문자로만 맞춘다 — 사용자가 같은 음식을 "닭가슴살"/"닭가슴살 " 로 적는 정도의
     * 차이는 흡수하고, 그 이상(띄어쓰기·양 표기)은 다른 음식으로 본다.
     */
    @Query("""
            select i from MealItem i join fetch i.meal m
            where m.userId = :userId
              and i.calories is not null
              and lower(i.name) in :names
            order by m.createdAt desc, i.id desc
            """)
    List<MealItem> findRecentWithCalories(@Param("userId") Long userId,
                                          @Param("names") Collection<String> names);
}
