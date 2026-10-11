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

    /**
     * 이 장소에서 예전에 기록한 메뉴 이름 — 음식 사진 분석의 참고 정보({@code MealPlaceHintLoader}).
     * 방문(place_visits.meal_id) → 항목을 한 번에 조인해 이름으로 묶고 가장 최근 방문순으로 자른다 —
     * 방문마다 항목을 따로 읽지 않는다. 커플 장소라 상대가 남긴 방문의 메뉴도 들어온다(같이 먹은 상이
     * 대부분이다).
     */
    @Query("""
            select i.name from MealItem i
            join PlaceVisit v on v.mealId = i.meal.id
            where v.placeId = :placeId
            group by i.name
            order by max(v.visitedAt) desc, max(v.id) desc
            """)
    List<String> findRecentNamesAtPlace(@Param("placeId") Long placeId, Pageable pageable);
}
