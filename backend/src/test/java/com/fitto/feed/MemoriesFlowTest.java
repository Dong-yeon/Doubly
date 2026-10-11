package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.TestPro;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.dto.MemoryGroupResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 추억 리마인드 통합 플로우 (PLAN.md Memories) — H2 기반.
 *
 * <p><b>저장 TZ 를 UTC 로 고정한다.</b> 기본값은 JVM 기본 TZ 라 개발 머신(KST)에서 돌리면
 * 시간대 보정이 항등이 되어 운영 경로를 아예 검증하지 못한다. 여기서 UTC 로 못박고
 * {@code created_at} 을 직접 써넣어, 어떤 머신에서 돌려도 같은 결과가 나오게 한다.
 * (보정 계산 자체의 검증은 {@code MemoryDatesTest})
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "fitto.storage-zone=UTC")
class MemoriesFlowTest {

    /** 기준일 — 실제 오늘과 무관하게 고정한다. */
    private static final LocalDate TODAY = LocalDate.of(2026, 7, 30);

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired SubscriptionRepository subscriptionRepository;
    @Autowired FeedService feedService;
    @Autowired MemoriesService memoriesService;
    @Autowired PlaceService placeService;
    @Autowired WorkoutService workoutService;
    @Autowired MealService mealService;
    @Autowired com.fitto.calendar.service.CalendarService calendarService;

    @PersistenceContext EntityManager em;

    /**
     * 가입 IP 를 매번 다르게 준다.
     *
     * <p>{@code AuthRateLimiter} 가 회원가입을 <b>IP 기준 시간당 10회</b>로 막는데,
     * 이 클래스는 그보다 많은 계정을 만든다. 같은 IP 를 쓰면 뒤쪽 테스트가 429 로 죽고,
     * Redis 가 떠 있으면 카운터가 한 시간 남아 다음 실행까지 오염된다.
     */
    private static final java.util.concurrent.atomic.AtomicInteger IP_SEQ =
            new java.util.concurrent.atomic.AtomicInteger();

    private Long register(String email) {
        String ip = "10.30.0." + IP_SEQ.incrementAndGet();
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), ip)
                .user().id();
    }

    private long[] couple(String a, String b) {
        Long ida = register(a);
        Long idb = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ida);
        relationService.connectCouple(idb, invite.code());
        // 추억은 PRO 기능이다 — 전역 무료 체험을 끈 뒤로는 구독이 있어야 열린다(TestPro 주석)
        TestPro.grant(subscriptionRepository, ida, idb);
        return new long[]{ida, idb};
    }

    /** 포스트를 만들고 created_at 을 원하는 저장 벽시계(UTC) 값으로 바꾼다. */
    private Long postAt(Long userId, String content, LocalDateTime storedAt) {
        FeedItemResponse post = feedService.createPost(userId, new CreatePostRequest(content, null));
        em.flush();
        em.createNativeQuery("update feed_posts set created_at = :t, record_date = :d where id = :id")
                .setParameter("t", storedAt)
                // 기록일(V119)은 그 시각(UTC 벽시계)에 올렸다면 받았을 KST 날짜 — 예전 created_at 기준과 같은 날
                .setParameter("d", storedAt.atZone(java.time.ZoneOffset.UTC)
                        .withZoneSameInstant(java.time.ZoneId.of("Asia/Seoul")).toLocalDate())
                .setParameter("id", post.refId())
                .executeUpdate();
        em.flush();
        em.clear();
        return post.refId();
    }

    // ---- 연도 그룹 ----

    @Test
    @Transactional
    void 여러_해의_같은_날이_최신_연도부터_그룹으로_묶인다() {
        long[] c = couple("mem-a@fitto.com", "mem-b@fitto.com");
        postAt(c[0], "1년 전 한강", LocalDateTime.of(2025, 7, 30, 3, 0));    // UTC 03:00 = KST 12:00
        postAt(c[1], "3년 전 제주", LocalDateTime.of(2023, 7, 30, 3, 0));

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.on()).isEqualTo(TODAY);
        assertThat(res.totalCount()).isEqualTo(2);
        assertThat(res.groups()).extracting(MemoryGroupResponse::yearsAgo).containsExactly(1, 3);
        assertThat(res.groups().get(0).label()).isEqualTo("1년 전 오늘");
        assertThat(res.groups().get(0).date()).isEqualTo(LocalDate.of(2025, 7, 30));
        // 상대가 쓴 포스트는 mine=false 로 구분된다
        assertThat(res.groups().get(1).items()).allSatisfy(i -> assertThat(i.mine()).isFalse());
    }

    @Test
    @Transactional
    void 올해_기록과_다른_날짜_기록은_추억이_아니다() {
        long[] c = couple("mem-c@fitto.com", "mem-d@fitto.com");
        postAt(c[0], "올해 같은 날", LocalDateTime.of(2026, 7, 30, 3, 0));   // 1년이 안 됐다
        postAt(c[0], "작년 다른 날", LocalDateTime.of(2025, 7, 29, 3, 0));   // 하루 어긋난다
        postAt(c[0], "작년 오늘", LocalDateTime.of(2025, 7, 30, 3, 0));

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.totalCount()).isEqualTo(1);
        assertThat(res.groups()).hasSize(1);
        assertThat(res.groups().get(0).items().get(0).content()).isEqualTo("작년 오늘");
    }

    @Test
    @Transactional
    void 추억이_없으면_빈_그룹으로_돌려준다() {
        long[] c = couple("mem-e@fitto.com", "mem-f@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("오늘의 기록", null));

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.totalCount()).isZero();
        assertThat(res.groups()).isEmpty();
    }

    @Test
    void 기록이_하나도_없어도_예외가_아니다() {
        long[] c = couple("mem-g@fitto.com", "mem-h@fitto.com");

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.groups()).isEmpty();
        assertThat(res.totalCount()).isZero();
    }

    // ---- 시간대 ----

    /**
     * UTC 저장 기준 KST 하루는 [전날 15:00, 당일 15:00) 이다.
     * 보정이 빠지면 KST 00:00~09:00 에 남긴 기록(=UTC 전날 15:00~24:00)을 통째로 놓친다.
     */
    @Test
    @Transactional
    void KST_새벽에_남긴_기록도_그_날의_추억이다() {
        long[] c = couple("mem-tz-a@fitto.com", "mem-tz-b@fitto.com");
        // KST 2025-07-30 00:30 == UTC 2025-07-29 15:30
        postAt(c[0], "새벽 산책", LocalDateTime.of(2025, 7, 29, 15, 30));
        // KST 2025-07-29 23:30 == UTC 2025-07-29 14:30 — 하루 전이라 제외돼야 한다
        postAt(c[0], "전날 밤", LocalDateTime.of(2025, 7, 29, 14, 30));

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.totalCount()).isEqualTo(1);
        assertThat(res.groups().get(0).items().get(0).content()).isEqualTo("새벽 산책");
    }

    // ---- 윤년 ----

    @Test
    @Transactional
    void 평년_2월_28일에는_윤년_2월_29일_기록도_함께_보인다() {
        long[] c = couple("mem-leap-a@fitto.com", "mem-leap-b@fitto.com");
        // KST 2024-02-29 12:00 == UTC 2024-02-29 03:00
        postAt(c[0], "윤날의 기록", LocalDateTime.of(2024, 2, 29, 3, 0));
        postAt(c[0], "윤년 2월 28일", LocalDateTime.of(2024, 2, 28, 3, 0));

        // 2026-02-28 은 평년 — 2/29 기록이 여기로 당겨져야 한다
        MemoriesResponse res = memoriesService.memories(c[0], LocalDate.of(2026, 2, 28));

        assertThat(res.groups()).hasSize(1);
        assertThat(res.groups().get(0).yearsAgo()).isEqualTo(2);
        assertThat(res.groups().get(0).items())
                .extracting(FeedItemResponse::content)
                .containsExactlyInAnyOrder("윤날의 기록", "윤년 2월 28일");
    }

    // ---- 방문 기록 ----

    /**
     * 방문은 등록 시각이 아니라 방문일 기준이다 — 어제 다녀와서 오늘 등록해도 어제의 추억이다.
     * (피드 타임라인은 created_at 을 쓴다 — 의도된 불일치)
     */
    @Test
    @Transactional
    void 방문_기록은_등록일이_아니라_방문일로_묶인다() {
        long[] c = couple("mem-visit-a@fitto.com", "mem-visit-b@fitto.com");
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "성산일출봉", "제주", null, null, "관광")).id();
        // 오늘 등록하지만 방문일은 1년 전
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.of(2025, 7, 30), 5, "최고였다", null, null));

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.totalCount()).isEqualTo(1);
        FeedItemResponse item = res.groups().get(0).items().get(0);
        assertThat(item.type()).isEqualTo(FeedItemType.PLACE_VISIT);
        // 카드 왼쪽 아이콘이 이미 '장소'를 말하므로 제목에 📍을 다시 붙이지 않는다
        assertThat(item.title()).isEqualTo("성산일출봉 방문");
        assertThat(item.content()).isEqualTo("★★★★★ 최고였다");
        // occurredAt 이 등록 시각(오늘)이 아니라 방문일이어야 한다
        assertThat(item.occurredAt().toLocalDate()).isEqualTo(LocalDate.of(2025, 7, 30));
    }

    // ---- 소스 제외 ----

    @Test
    @Transactional
    void 사진_없는_운동과_식단은_추억에_포함되지_않는다() {
        long[] c = couple("mem-src-a@fitto.com", "mem-src-b@fitto.com");
        workoutService.save(c[0], new SaveWorkoutRequest(LocalDate.of(2025, 7, 30), null, 30, null,
                List.of(new WorkoutSetRequest("러닝", "유산소", 1, null, null, 1))));
        mealService.save(c[0], new SaveMealRequest(LocalDate.of(2025, 7, 30), MealType.DINNER,
                "회식", null, 800, null, null, null, null, null, null, null));
        em.flush();
        em.createNativeQuery("update workouts set created_at = :t")
                .setParameter("t", LocalDateTime.of(2025, 7, 30, 3, 0)).executeUpdate();
        em.createNativeQuery("update meals set created_at = :t")
                .setParameter("t", LocalDateTime.of(2025, 7, 30, 3, 0)).executeUpdate();
        em.flush();
        em.clear();

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.groups()).isEmpty();
    }

    // ---- 반응 ----

    @Test
    @Transactional
    void 포스트에_달린_반응이_함께_내려온다() {
        long[] c = couple("mem-react-a@fitto.com", "mem-react-b@fitto.com");
        Long postId = postAt(c[0], "작년 벚꽃", LocalDateTime.of(2025, 7, 30, 3, 0));
        feedService.toggleReaction(c[1], FeedItemType.POST, postId, "❤️");

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.groups().get(0).items().get(0).reactions())
                .anyMatch(r -> r.emoji().equals("❤️") && r.count() == 1);
    }

    // ---- 접근 제어 ----

    @Test
    void 커플이_아니면_추억을_볼_수_없다() {
        Long solo = register("mem-solo@fitto.com");

        assertThatThrownBy(() -> memoriesService.memories(solo, TODAY))
                .isInstanceOf(BusinessException.class);
    }

    // ---- 사진 있는 식단·운동 (2026-10-02) ----

    /**
     * 사진을 남긴 끼니·공유한 오운완은 추억에 실린다 — 등록일이 아니라 먹은 날·운동한 날 기준이고,
     * 공유하지 않은 운동 사진은 사진첩과 같이 빠진다.
     */
    @Test
    @Transactional
    void 사진_있는_식단과_공유한_운동_사진은_기록일로_추억에_실린다() {
        long[] c = couple("mem-photo-a@fitto.com", "mem-photo-b@fitto.com");
        LocalDate lastYear = LocalDate.of(2025, 7, 30);
        // 작년 오늘 먹은 끼니를 사흘 뒤에 올렸다 — 등록일이 아니라 먹은 날로 묶여야 한다
        mealService.save(c[0], new SaveMealRequest(lastYear, MealType.LUNCH, "냉면",
                "https://img.example.com/mem-meal.jpg", 600, null, null, null, null, null, null, null, false));
        workoutService.save(c[1], new SaveWorkoutRequest(lastYear, null, 30, null, null,
                "https://img.example.com/mem-ootd.jpg", true, List.of()));
        workoutService.save(c[1], new SaveWorkoutRequest(lastYear, null, 30, null, null,
                "https://img.example.com/mem-route.jpg", false, List.of()));
        em.flush();
        em.createNativeQuery("update meals set created_at = :t")
                .setParameter("t", LocalDateTime.of(2025, 8, 2, 3, 0)).executeUpdate();
        em.flush();
        em.clear();

        MemoriesResponse res = memoriesService.memories(c[0], TODAY);

        assertThat(res.groups()).singleElement().satisfies(g -> {
            assertThat(g.yearsAgo()).isEqualTo(1);
            assertThat(g.items()).extracting(FeedItemResponse::imageUrl)
                    .containsExactlyInAnyOrder("https://img.example.com/mem-meal.jpg",
                            "https://img.example.com/mem-ootd.jpg");
            assertThat(g.items()).allSatisfy(i ->
                    assertThat(i.occurredAt()).isEqualTo(lastYear.atStartOfDay()));
        });
    }

    // ---- 기념일 ----

    @Test
    @Transactional
    void 사귄_날_기준_주년과_100일_단위가_오늘의_기념일로_온다() {
        long[] c = couple("mem-anniv-a@fitto.com", "mem-anniv-b@fitto.com");
        relationService.setAnniversary(c[0], LocalDate.of(2024, 7, 30));

        assertThat(memoriesService.memories(c[0], TODAY).anniversaries())
                .extracting(com.fitto.feed.dto.MemoryAnniversaryResponse::label)
                .containsExactly("오늘은 우리 2주년");

        // 사귄 날이 1일 — TODAY 가 300일째가 되는 날로 옮긴다
        relationService.setAnniversary(c[0], TODAY.minusDays(299));
        assertThat(memoriesService.memories(c[1], TODAY).anniversaries())
                .extracting(com.fitto.feed.dto.MemoryAnniversaryResponse::label)
                .containsExactly("오늘은 우리 300일");
        // 기록이 하나도 없어도 기념일은 온다
        assertThat(memoriesService.memories(c[1], TODAY).groups()).isEmpty();
    }

    @Test
    @Transactional
    void 캘린더의_반복_기념일과_몇_년_전_일정이_오고_상대의_나만_보기는_빠진다() {
        long[] c = couple("mem-cal-a@fitto.com", "mem-cal-b@fitto.com");
        calendarService.create(c[0], new com.fitto.calendar.dto.CreateEventRequest("처음 만난 날",
                LocalDate.of(2023, 7, 30), null, com.fitto.calendar.domain.EventType.ANNIVERSARY, true, null));
        calendarService.create(c[0], new com.fitto.calendar.dto.CreateEventRequest("제주 여행",
                LocalDate.of(2025, 7, 30), null, com.fitto.calendar.domain.EventType.DATE, false, null));
        calendarService.create(c[1], new com.fitto.calendar.dto.CreateEventRequest("비밀 계획",
                LocalDate.of(2025, 7, 30), null, com.fitto.calendar.domain.EventType.ETC, false,
                com.fitto.calendar.domain.EventVisibility.PRIVATE, null));
        // 올해 일정·다른 날 일정은 기념일이 아니다
        calendarService.create(c[0], new com.fitto.calendar.dto.CreateEventRequest("올해 일정",
                TODAY, null, com.fitto.calendar.domain.EventType.DATE, false, null));

        assertThat(memoriesService.memories(c[0], TODAY).anniversaries())
                .extracting(com.fitto.feed.dto.MemoryAnniversaryResponse::label)
                .containsExactlyInAnyOrder("처음 만난 날 3주년", "1년 전 오늘 · 제주 여행");
        // 만든 사람에겐 자기 '나만 보기' 일정도 보인다
        assertThat(memoriesService.memories(c[1], TODAY).anniversaries())
                .extracting(com.fitto.feed.dto.MemoryAnniversaryResponse::label)
                .contains("1년 전 오늘 · 비밀 계획");
    }
}
