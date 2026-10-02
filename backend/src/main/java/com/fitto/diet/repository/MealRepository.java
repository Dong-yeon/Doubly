package com.fitto.diet.repository;

import com.fitto.diet.domain.Meal;
import com.fitto.diet.domain.MealType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface MealRepository extends JpaRepository<Meal, Long> {

    List<Meal> findByUserIdAndMealDateOrderByIdAsc(Long userId, LocalDate mealDate);

    boolean existsByUserIdAndMealDate(Long userId, LocalDate mealDate);

    /** 끼니 알림(MealReminderNotifier) — 이 끼니를 이미 기록했으면 알림을 건너뛴다. */
    boolean existsByUserIdAndMealDateAndMealType(Long userId, LocalDate mealDate, MealType mealType);

    /** 특정 기간의 기록 — 통계(끼니 완료/칼로리 집계)용. */
    List<Meal> findByUserIdAndMealDateBetween(Long userId, LocalDate start, LocalDate end);

    /** 데이트 식단 짝 — 같은 shared_group_id 를 가진 커플 양쪽 레코드(자기 자신 포함). */
    List<Meal> findBySharedGroupId(String sharedGroupId);

    /**
     * 내가 이 사진(URL)으로 남긴 식단 — 채팅 사진을 식단으로 옮길 때 중복을 막는다. photo_url 은 TEXT 라
     * H2 에서 CLOB 이 되어 그대로는 비교가 안 된다 — varchar 로 맞춘다(StoredMediaReferences 와 같은 처방).
     * 상대 명의의 데이트 식단 복사본은 상대 행이라 걸리지 않는다.
     */
    @Query("""
            select m from Meal m
            where m.userId = :userId and m.photoUrl is not null and cast(m.photoUrl as string) = :photoUrl
            order by m.id asc
            """)
    List<Meal> findByUserIdAndPhoto(@Param("userId") Long userId, @Param("photoUrl") String photoUrl, Pageable pageable);

    /** 그날 기록한 끼니 종류(중복 없이) — 홈 "오늘 챙김" 링. 내용은 읽지 않는다 */
    @Query("select distinct m.mealType from Meal m where m.userId = :userId and m.mealDate = :date")
    List<MealType> findMealTypes(@Param("userId") Long userId, @Param("date") LocalDate date);

    /** 데이트 식단 짝을 한 번에 — 목록의 복사본들이 반응을 읽을 원본 id 를 찾는다(MealService.withPlaces) */
    List<Meal> findBySharedGroupIdIn(java.util.Collection<String> sharedGroupIds);

    /**
     * 커플 캘린더의 데이트 식단 오버레이 — 두 사람의 "같이 먹기" 기록 중 그 기간 것.
     *
     * <p>{@link #findRecentForFeed} 와 같은 이유로 파트너 복제본을 뺀다(원본만 created_by 가
     * null 이거나 user_id 와 같다). 캘린더는 하루에 한 줄을 그리므로 짝이 둘 다 실리면
     * 같은 한 끼가 두 번 찍힌다.
     */
    @Query("""
            select m from Meal m
            where m.userId in :userIds
              and m.sharedGroupId is not null
              and (m.createdBy is null or m.createdBy = m.userId)
              and m.mealDate between :start and :end
            order by m.mealDate asc, m.id asc
            """)
    List<Meal> findSharedInPeriod(@Param("userIds") List<Long> userIds,
                                  @Param("start") LocalDate start,
                                  @Param("end") LocalDate end);

    /** 최근 먹은 음식 자동완성 원본 — 최신순 최대 200건을 가져와 서비스에서 memo 기준으로 집계한다.
     * DB 마다 다른 DISTINCT ON 류 문법을 안 쓰려고(H2 호환) Java 에서 그룹핑한다. */
    List<Meal> findTop200ByUserIdOrderByCreatedAtDesc(Long userId);

    /**
     * 히스토리 첫 페이지 — <b>오늘 이전</b>, 먹은 날짜 최신순(같은 날은 나중에 적은 것 먼저).
     *
     * <p>예전엔 날짜 조건 없이 {@code id desc} 였다. 오늘 식사가 화면의 "오늘" 섹션과 히스토리 맨 위에 두 번
     * 나왔고, 지난 날짜로 나중에 적은 기록·어제 복사분이 순서를 깼다(LOVEBODY_REVIEW_2026-10-02 §3 A-2).
     * {@code idx_meals_user_date (user_id, meal_date)} 를 탄다.
     */
    @Query("""
            select m from Meal m
            where m.userId = :userId and m.mealDate < :today
            order by m.mealDate desc, m.id desc
            """)
    List<Meal> findHistoryFirstPage(@Param("userId") Long userId,
                                    @Param("today") LocalDate today,
                                    Pageable pageable);

    /**
     * 히스토리 다음 페이지 — (meal_date, id) 복합 커서보다 뒤인 것. 정렬이 날짜 우선이라 id 하나로는
     * 경계를 정할 수 없다. 쿼리를 둘로 나눈 이유: {@code :cursor is null} 분기는 PostgreSQL 이
     * 파라미터 타입을 못 정해 거절한 전례가 있다(docs/RUNNING.md).
     */
    @Query("""
            select m from Meal m
            where m.userId = :userId and m.mealDate < :today
              and (m.mealDate < :cursorDate or (m.mealDate = :cursorDate and m.id < :cursorId))
            order by m.mealDate desc, m.id desc
            """)
    List<Meal> findHistoryAfter(@Param("userId") Long userId,
                                @Param("today") LocalDate today,
                                @Param("cursorDate") LocalDate cursorDate,
                                @Param("cursorId") Long cursorId,
                                Pageable pageable);

    /** 커서로 받은 기록이 그사이 지워졌을 때 — 그보다 앞서 적은 내 기록 중 가장 가까운 것을 기준점으로 */
    Optional<Meal> findTopByUserIdAndIdLessThanOrderByIdDesc(Long userId, Long id);

    /** 캘린더 — 해당 기간 식단을 기록한 날짜(중복 제거). */
    @Query("""
            select distinct m.mealDate from Meal m
            where m.userId = :userId and m.mealDate between :start and :end
            order by m.mealDate
            """)
    List<LocalDate> findMealDates(@Param("userId") Long userId,
                                  @Param("start") LocalDate start,
                                  @Param("end") LocalDate end);

    /** 전체 기록한 날 수(중복 제거). */
    @Query("select count(distinct m.mealDate) from Meal m where m.userId = :userId")
    long countDistinctMealDates(@Param("userId") Long userId);

    /**
     * 커플 피드 타임라인 — 두 사람의 기록 중 커서 (createdAt, id) 이전, 최신순.
     * cursorAt 이 null 이면 첫 페이지(전체 조회)다.
     *
     * <p><b>데이트 식단의 파트너 복제본은 제외한다</b>. 이 쿼리는 두 사람의 기록을 함께 읽는데,
     * "같이 먹기"는 커플 양쪽에 짝을 만들므로({@code MealService.copyForPartner}) 그대로 두면
     * 같은 한 끼가 카드 두 장으로 나왔다. 복제본만 {@code created_by}(원 등록자)가
     * {@code user_id} 와 다르므로 그 한 줄로 정확히 걸러진다 — 원본과 일반 기록은
     * {@code created_by} 가 null 이다.
     *
     * <p>화면단에서 묶지 않고 쿼리에서 거르는 이유: 페이지 경계에서 짝의 한쪽만 실려 오면
     * 중복 제거가 페이지를 넘지 못한다.
     */
    @Query("""
            select m from Meal m
            where m.userId in :userIds
              and (m.createdBy is null or m.createdBy = m.userId)
              and (cast(:cursorAt as LocalDateTime) is null
                   or m.createdAt < :cursorAt
                   or (m.createdAt = :cursorAt and m.id < :cursorId))
            order by m.createdAt desc, m.id desc
            """)
    List<Meal> findRecentForFeed(@Param("userIds") List<Long> userIds,
                                 @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                 @Param("cursorId") Long cursorId,
                                 Pageable pageable);

    /**
     * 우리 탭(사진첩) — 사진이 붙은 끼니만. {@link #findRecentForFeed} 와 같은 keyset·같은
     * 복제본 제외 규칙을 쓰고 {@code photo_url is not null} 만 더한다
     * (docs/ALBUM_TAB_IA_2026-09-14.md 5-4).
     *
     * <p><b>정렬은 기록일 우선</b>(2026-10-02 결정) — (기록일, created_at, id) keyset 이다.
     * 지난 날짜로 늦게 올린 기록이 올린 달이 아니라 그 날짜에 묶여야 달력·회고와 의미가 맞는다.
     * 타임라인({@code findRecentForFeed})은 업로드 순서 그대로다 — 통일하지 말 것.
     */
    @Query("""
            select m from Meal m
            where m.userId in :userIds
              and m.photoUrl is not null
              and (m.createdBy is null or m.createdBy = m.userId)
              and (cast(:cursorDate as LocalDate) is null
                   or m.mealDate < :cursorDate
                   or (m.mealDate = :cursorDate
                       and (m.createdAt < :cursorAt
                            or (m.createdAt = :cursorAt and m.id < :cursorId))))
            order by m.mealDate desc, m.createdAt desc, m.id desc
            """)
    List<Meal> findPhotosForFeed(@Param("userIds") List<Long> userIds,
                                 @Param("cursorDate") java.time.LocalDate cursorDate,
                                 @Param("cursorAt") java.time.LocalDateTime cursorAt,
                                 @Param("cursorId") Long cursorId,
                                 Pageable pageable);

    /** 회원 탈퇴 시 본인 식단 기록 삭제. */
    @Modifying
    @Query("delete from Meal m where m.userId = :userId")
    void deleteAllByUserId(@Param("userId") Long userId);
}
