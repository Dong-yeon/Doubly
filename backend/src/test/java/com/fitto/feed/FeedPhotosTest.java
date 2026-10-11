package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedPhotoResponse;
import com.fitto.feed.dto.FeedPhotosResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 사진첩("우리" 탭) 4소스 통합 — docs/ALBUM_TAB_IA_2026-09-14.md 5-4 / 6절 1단계.
 *
 * <p>확인하는 것: 소스별 병합 순서 · 커서 연속성(중복·누락) · 소스 필터 ·
 * 중복 제거 두 규칙(데이트 식단 복제본, 식단에서 파생된 방문).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedPhotosTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    FeedService feedService;
    @Autowired
    WorkoutService workoutService;
    @Autowired
    MealService mealService;
    @Autowired
    PlaceService placeService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    /** 사진 붙은 점심 한 끼 — 끼니 id 를 돌려준다(방문 파생 테스트가 쓴다) */
    private Long mealWithPhoto(long userId, String photoUrl, boolean shared) {
        return mealWithPhoto(userId, photoUrl, shared, LocalDate.now());
    }

    private Long mealWithPhoto(long userId, String photoUrl, boolean shared, LocalDate mealDate) {
        return mealService.save(userId, new SaveMealRequest(mealDate, MealType.LUNCH, "점심",
                photoUrl, 600, null, null, null, null, null, null, null, shared)).id();
    }

    /** 오운완 인증샷(피드 공유) — 사진첩에 실리는 운동 사진 */
    private void workoutWithPhoto(long userId, String imageUrl) {
        workoutWithPhoto(userId, imageUrl, true);
    }

    private void workoutWithPhoto(long userId, String imageUrl, boolean shared) {
        workoutWithPhoto(userId, imageUrl, shared, LocalDate.now());
    }

    private void workoutWithPhoto(long userId, String imageUrl, boolean shared, LocalDate workoutDate) {
        workoutService.save(userId, new SaveWorkoutRequest(workoutDate, null, 30, null, null,
                imageUrl, shared, List.of()));
    }

    @Test
    void 사진첩은_일상_식단_운동_맛집_네_소스를_모두_모아_최신순으로_준다() {
        long[] c = couple("ph-all-a@fitto.com", "ph-all-b@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("일상", "https://img.example.com/post.jpg"));
        mealWithPhoto(c[0], "https://img.example.com/meal.jpg", false);
        workoutWithPhoto(c[1], "https://img.example.com/workout.jpg");
        Long placeId = placeService.save(c[0],
                new SavePlaceRequest("그 가게", null, null, null, null)).id();
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.now(), 5, "좋았다", "https://img.example.com/visit.jpg", null));

        FeedPhotosResponse page = feedService.photos(c[0], null, 20, null);

        assertThat(page.items()).extracting(FeedPhotoResponse::type)
                .containsExactlyInAnyOrder(FeedItemType.POST, FeedItemType.MEAL,
                        FeedItemType.WORKOUT, FeedItemType.PLACE_VISIT);
        // 기록일 최신순, 같은 날이면 올린 시각 역순 — 정렬 키가 (기록일, createdAt, refId) 복합키다
        assertThat(page.items()).isSortedAccordingTo(
                java.util.Comparator.comparing(FeedPhotoResponse::recordDate)
                        .thenComparing(FeedPhotoResponse::createdAt)
                        .reversed());
        assertThat(page.items()).allSatisfy(p -> assertThat(p.recordDate()).isNotNull());
        assertThat(page.items()).allSatisfy(p -> assertThat(p.imageUrl()).isNotNull());
        // 상대가 올린 사진도 함께 보이고 mine 으로 구분된다
        assertThat(page.items()).anySatisfy(p -> assertThat(p.mine()).isFalse());
    }

    @Test
    void 사진이_없는_기록은_사진첩에_들어오지_않는다() {
        long[] c = couple("ph-none-a@fitto.com", "ph-none-b@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("글만 있는 포스트", null));
        mealWithPhoto(c[0], null, false);
        workoutWithPhoto(c[0], null);

        assertThat(feedService.photos(c[0], null, 20, null).items()).isEmpty();
    }

    /**
     * 공유하지 않은 운동 사진(V94 이전 "애인에게는 공유되지 않아요" 사진 — 러닝 경로 지도가
     * 찍혀 있을 수 있다)은 상대의 사진첩에 뜨면 안 된다. 타임라인과 같이 본인에게도 싣지 않는다.
     */
    @Test
    void 공유하지_않은_운동_사진은_사진첩에_싣지_않는다() {
        long[] c = couple("ph-unshared-a@fitto.com", "ph-unshared-b@fitto.com");
        workoutWithPhoto(c[1], "https://img.example.com/route-map.jpg", false);
        workoutWithPhoto(c[1], "https://img.example.com/ootd.jpg", true);

        for (long viewer : c) {
            FeedPhotosResponse page = feedService.photos(viewer, null, 20, List.of(FeedItemType.WORKOUT));
            assertThat(page.items()).extracting(FeedPhotoResponse::imageUrl)
                    .containsExactly("https://img.example.com/ootd.jpg");
        }
    }

    @Test
    void 소스를_지정하면_그_소스만_내려준다() {
        long[] c = couple("ph-filter-a@fitto.com", "ph-filter-b@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("일상", "https://img.example.com/p.jpg"));
        mealWithPhoto(c[0], "https://img.example.com/m.jpg", false);
        workoutWithPhoto(c[0], "https://img.example.com/w.jpg");

        FeedPhotosResponse onlyBody = feedService.photos(c[0], null, 20,
                List.of(FeedItemType.MEAL, FeedItemType.WORKOUT));

        assertThat(onlyBody.items()).extracting(FeedPhotoResponse::type)
                .containsExactlyInAnyOrder(FeedItemType.MEAL, FeedItemType.WORKOUT);
    }

    @Test
    void 커서로_이어_받아도_중복이나_누락이_없다() {
        long[] c = couple("ph-cursor-a@fitto.com", "ph-cursor-b@fitto.com");
        for (int i = 0; i < 3; i++) {
            feedService.createPost(c[0], new CreatePostRequest("일상 " + i, "https://img.example.com/p" + i + ".jpg"));
            mealWithPhoto(c[0], "https://img.example.com/m" + i + ".jpg", false);
            workoutWithPhoto(c[1], "https://img.example.com/w" + i + ".jpg");
        }

        List<String> keys = new ArrayList<>();
        String cursor = null;
        for (int guard = 0; guard < 10; guard++) {
            FeedPhotosResponse page = feedService.photos(c[0], cursor, 4, null);
            page.items().forEach(p -> keys.add(p.type() + ":" + p.refId()));
            if (!page.hasMore()) {
                break;
            }
            cursor = page.nextCursor();
        }

        Set<String> unique = new HashSet<>(keys);
        assertThat(keys).hasSize(9);          // 3소스 × 3건 — 누락 없음
        assertThat(unique).hasSize(9);        // 페이지 경계에서 중복 없음
    }

    /**
     * 데이트 식단은 커플 양쪽에 짝이 생기므로(MealService.copyForPartner) 거르지 않으면
     * 같은 한 끼의 같은 사진이 두 칸으로 뜬다 — 원본만 남긴다.
     */
    @Test
    void 데이트_식단은_복제본을_빼고_한_장만_싣는다() {
        long[] c = couple("ph-date-a@fitto.com", "ph-date-b@fitto.com");
        mealWithPhoto(c[0], "https://img.example.com/date.jpg", true);

        // 등록한 쪽과 상대 쪽 모두에서 한 칸이어야 한다(복제본이 걸러지는 건 쿼리 단계라 양쪽 동일)
        assertThat(feedService.photos(c[0], null, 20, null).items()).hasSize(1);
        assertThat(feedService.photos(c[1], null, 20, null).items()).hasSize(1);
    }

    /**
     * 식단에 장소를 붙이면 방문이 함께 만들어지고 사진도 같은 파일이 실린다
     * ({@code place_visits.meal_id}). 그대로 두면 한 장이 식단·맛집 두 칸으로 뜬다.
     */
    @Test
    void 식단에서_파생된_방문은_사진첩에서_제외한다() {
        long[] c = couple("ph-derived-a@fitto.com", "ph-derived-b@fitto.com");
        Long mealId = mealWithPhoto(c[0], "https://img.example.com/shared-photo.jpg", false);
        Long placeId = placeService.save(c[0],
                new SavePlaceRequest("식단에 붙은 가게", null, null, null, null)).id();
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(
                LocalDate.now(), 4, "식단에서 등록", "https://img.example.com/shared-photo.jpg", mealId));

        FeedPhotosResponse page = feedService.photos(c[0], null, 20, null);

        assertThat(page.items()).extracting(FeedPhotoResponse::type)
                .containsExactly(FeedItemType.MEAL);
    }

    /**
     * 캡션을 타임라인 매퍼로 만드는 이유가 여기 있다 — 문구 규칙이 한 벌이어야 한다.
     *
     * <p>특히 <b>칼로리는 실리지 않아야 한다</b>. 피드·앨범은 기록하면 자동으로 상대에게
     * 보이는 자리라, 먹은 칼로리가 매 끼니 노출되면 응원이 아니라 감시로 읽힌다
     * (2026-09-13 결정, {@code FeedItemMapper.toItem(Meal, ...)} 주석). 사진첩이 캡션을
     * 따로 만들면 그 결정이 조용히 뚫리므로, 이 테스트가 그 경로를 막아 둔다.
     */
    @Test
    void 캡션은_타임라인과_같은_문구_규칙을_따른다_칼로리는_싣지_않는다() {
        long[] c = couple("ph-caption-a@fitto.com", "ph-caption-b@fitto.com");
        mealWithPhoto(c[0], "https://img.example.com/cap-meal.jpg", false);

        FeedPhotoResponse item = feedService.photos(c[0], null, 20, List.of(FeedItemType.MEAL))
                .items().get(0);

        // 식단 캡션 = "음식(또는 메모) · 끼니" — 무엇을 먹었는지는 남기고 얼마나는 뺀다
        assertThat(item.caption()).contains("점심");
        assertThat(item.caption()).doesNotContain("kcal");
        assertThat(item.authorName()).isEqualTo("나");
    }

    /**
     * 작성자 필터는 서버에서 거른다 — 클라이언트에서 페이지를 거르면 한쪽이 몰아 올린 날
     * 반대쪽 화면이 빈 페이지만 받는다. 포스트(author_id)·방문(visited_by)·식단/운동(user_id)
     * 네 갈래가 모두 같은 사람으로 걸러져야 한다.
     */
    @Test
    void 작성자를_지정하면_그_사람이_올린_사진만_준다() {
        long[] c = couple("ph-who-a@fitto.com", "ph-who-b@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("내 일상", "https://img.example.com/me-post.jpg"));
        feedService.createPost(c[1], new CreatePostRequest("상대 일상", "https://img.example.com/pa-post.jpg"));
        mealWithPhoto(c[0], "https://img.example.com/me-meal.jpg", false);
        workoutWithPhoto(c[1], "https://img.example.com/pa-workout.jpg");
        Long placeId = placeService.save(c[0], new SavePlaceRequest("가게", null, null, null, null)).id();
        placeService.recordVisit(c[1], placeId,
                new RecordVisitRequest(LocalDate.now(), 4, null, "https://img.example.com/pa-visit.jpg", null));

        assertThat(feedService.photos(c[0], null, 20, null, "me").items())
                .extracting(FeedPhotoResponse::imageUrl)
                .containsExactlyInAnyOrder("https://img.example.com/me-post.jpg", "https://img.example.com/me-meal.jpg");
        assertThat(feedService.photos(c[0], null, 20, null, "partner").items())
                .extracting(FeedPhotoResponse::imageUrl)
                .containsExactlyInAnyOrder("https://img.example.com/pa-post.jpg",
                        "https://img.example.com/pa-workout.jpg", "https://img.example.com/pa-visit.jpg");
        assertThat(feedService.photos(c[0], null, 20, null, null).items()).hasSize(5);
    }

    @Test
    void 모르는_작성자_필터는_거절한다() {
        long[] c = couple("ph-who-bad-a@fitto.com", "ph-who-bad-b@fitto.com");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> feedService.photos(c[0], null, 20, null, "everyone"))
                .isInstanceOf(com.fitto.common.exception.BusinessException.class);
    }

    /**
     * 뷰어의 "장소 보기"가 장소 상세로 가는 근거 — 맛집 방문은 그 장소, 장소를 붙인 끼니는
     * 파생 방문({@code meal_id})을 거슬러 그 장소를 싣는다. 장소가 없는 기록은 null.
     */
    @Test
    void 맛집_방문과_장소를_붙인_끼니는_장소_id_를_싣는다() {
        long[] c = couple("ph-place-a@fitto.com", "ph-place-b@fitto.com");
        Long visitPlace = placeService.save(c[0], new SavePlaceRequest("방문한 가게", null, null, null, null)).id();
        placeService.recordVisit(c[0], visitPlace,
                new RecordVisitRequest(LocalDate.now(), 5, null, "https://img.example.com/v.jpg", null));
        Long mealId = mealWithPhoto(c[0], "https://img.example.com/m.jpg", false);
        Long mealPlace = placeService.save(c[0], new SavePlaceRequest("끼니 가게", null, null, null, null)).id();
        placeService.recordVisit(c[0], mealPlace,
                new RecordVisitRequest(LocalDate.now(), 4, null, "https://img.example.com/m.jpg", mealId));
        workoutWithPhoto(c[0], "https://img.example.com/w.jpg");

        List<FeedPhotoResponse> items = feedService.photos(c[0], null, 20, null).items();

        assertThat(items).filteredOn(p -> p.type() == FeedItemType.PLACE_VISIT).singleElement()
                .satisfies(p -> {
                    assertThat(p.placeId()).isEqualTo(visitPlace);
                    assertThat(p.placeName()).isEqualTo("방문한 가게");
                });
        assertThat(items).filteredOn(p -> p.type() == FeedItemType.MEAL).singleElement()
                .satisfies(p -> {
                    assertThat(p.placeId()).isEqualTo(mealPlace);
                    assertThat(p.placeName()).isEqualTo("끼니 가게");
                });
        assertThat(items).filteredOn(p -> p.type() == FeedItemType.WORKOUT).singleElement()
                .satisfies(p -> assertThat(p.placeId()).isNull());
    }

    /**
     * 기록일 정렬(2026-10-02 결정) — 지난 날짜로 <b>나중에</b> 올린 기록은 올린 순서가 아니라
     * 그 날짜 자리에 들어가야 한다. 업로드 순으로는 가장 최신인 끼니가 맨 뒤로 가는지 본다.
     */
    @Test
    void 지난_날짜로_늦게_올린_기록은_기록일_자리에_묶인다() {
        long[] c = couple("ph-recdate-a@fitto.com", "ph-recdate-b@fitto.com");
        LocalDate today = LocalDate.now();
        workoutWithPhoto(c[0], "https://img.example.com/today-w.jpg", true, today);
        feedService.createPost(c[1], new CreatePostRequest("오늘 일상", "https://img.example.com/today-p.jpg"));
        // 마지막에 올렸지만 먹은 날은 한 달 전
        mealWithPhoto(c[0], "https://img.example.com/last-month-m.jpg", false, today.minusMonths(1));
        Long placeId = placeService.save(c[0], new SavePlaceRequest("가게", null, null, null, null)).id();
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(today.minusDays(3), 4, null, "https://img.example.com/3days-v.jpg", null));

        List<FeedPhotoResponse> items = feedService.photos(c[0], null, 20, null).items();

        assertThat(items).extracting(FeedPhotoResponse::imageUrl).last()
                .isEqualTo("https://img.example.com/last-month-m.jpg");
        assertThat(items).filteredOn(p -> p.type() == FeedItemType.MEAL).singleElement()
                .extracting(FeedPhotoResponse::recordDate).isEqualTo(today.minusMonths(1));
        assertThat(items).filteredOn(p -> p.type() == FeedItemType.PLACE_VISIT).singleElement()
                .extracting(FeedPhotoResponse::recordDate).isEqualTo(today.minusDays(3));
    }

    /**
     * 기록일이 뒤섞인 4소스를 작은 페이지로 끝까지 넘겨도 중복·누락이 없고, 이어 붙인 순서가
     * 전체 정렬과 같아야 한다 — 소스별 keyset 의 1차 키가 날짜로 바뀌었으므로 경계 조건을 다시 본다.
     */
    @Test
    void 기록일이_섞여도_커서로_이어_받으면_중복_누락_없이_정렬이_이어진다() {
        long[] c = couple("ph-datecur-a@fitto.com", "ph-datecur-b@fitto.com");
        LocalDate today = LocalDate.now();
        Long placeId = placeService.save(c[0], new SavePlaceRequest("가게", null, null, null, null)).id();
        int[] offsets = {0, 5, 1, 9, 1, 0, 30};
        for (int i = 0; i < offsets.length; i++) {
            LocalDate d = today.minusDays(offsets[i]);
            mealWithPhoto(c[i % 2], "https://img.example.com/dm" + i + ".jpg", false, d);
            workoutWithPhoto(c[(i + 1) % 2], "https://img.example.com/dw" + i + ".jpg", true, d);
            placeService.recordVisit(c[i % 2], placeId,
                    new RecordVisitRequest(d, 3, null, "https://img.example.com/dv" + i + ".jpg", null));
        }
        feedService.createPost(c[0], new CreatePostRequest("일상", "https://img.example.com/dp.jpg"));

        List<FeedPhotoResponse> all = new ArrayList<>();
        String cursor = null;
        for (int guard = 0; guard < 30; guard++) {
            FeedPhotosResponse page = feedService.photos(c[0], cursor, 4, null);
            all.addAll(page.items());
            if (!page.hasMore()) {
                break;
            }
            cursor = page.nextCursor();
        }

        assertThat(all).hasSize(offsets.length * 3 + 1);
        assertThat(all.stream().map(p -> p.type() + ":" + p.refId()).distinct()).hasSize(all.size());
        assertThat(all).isSortedAccordingTo(
                java.util.Comparator.comparing(FeedPhotoResponse::recordDate)
                        .thenComparing(FeedPhotoResponse::createdAt)
                        .reversed());
    }

    /**
     * 기록일 정렬 이전 형식의 커서(날짜 없음)를 들고 온 앱 — 오류 대신 첫 페이지로 되돌린다.
     */
    @Test
    void 날짜_없는_옛_커서는_첫_페이지로_되돌린다() {
        long[] c = couple("ph-oldcur-a@fitto.com", "ph-oldcur-b@fitto.com");
        mealWithPhoto(c[0], "https://img.example.com/o1.jpg", false);
        mealWithPhoto(c[0], "https://img.example.com/o2.jpg", false);
        String legacy = new com.fitto.feed.dto.FeedCursor(new java.util.EnumMap<>(java.util.Map.of(
                FeedItemType.MEAL, new com.fitto.feed.dto.FeedCursor.Position(
                        java.time.LocalDateTime.of(2000, 1, 1, 0, 0), 1L)))).encode();

        assertThat(feedService.photos(c[0], legacy, 20, null).items()).hasSize(2);
    }

    /**
     * 달력 — 기록일 기준으로 그 달의 사진만 준다. 이번 달에 올렸어도 지난달에 먹은 끼니는
     * 지난달 칸에 있어야 하고, 이번 달 조회엔 없어야 한다. 순서는 목록과 같은 (기록일, 올린 시각).
     */
    @Test
    void 달력은_기록일_기준으로_그_달의_사진만_준다() {
        long[] c = couple("ph-month-a@fitto.com", "ph-month-b@fitto.com");
        LocalDate today = LocalDate.now();
        java.time.YearMonth thisMonth = java.time.YearMonth.from(today);
        LocalDate lastMonthDay = thisMonth.minusMonths(1).atDay(10);
        feedService.createPost(c[0], new CreatePostRequest("오늘", "https://img.example.com/mo-p.jpg"));
        workoutWithPhoto(c[1], "https://img.example.com/mo-w.jpg", true, today);
        mealWithPhoto(c[0], "https://img.example.com/mo-m-last.jpg", false, lastMonthDay);
        Long placeId = placeService.save(c[0], new SavePlaceRequest("가게", null, null, null, null)).id();
        placeService.recordVisit(c[1], placeId,
                new RecordVisitRequest(lastMonthDay, 5, null, "https://img.example.com/mo-v-last.jpg", null));

        com.fitto.feed.dto.FeedPhotoMonthResponse now = feedService.photoMonth(c[0], thisMonth.toString(), null, null);
        com.fitto.feed.dto.FeedPhotoMonthResponse last =
                feedService.photoMonth(c[0], thisMonth.minusMonths(1).toString(), null, null);

        assertThat(now.month()).isEqualTo(thisMonth.toString());
        assertThat(now.items()).extracting(FeedPhotoResponse::imageUrl)
                .containsExactlyInAnyOrder("https://img.example.com/mo-p.jpg", "https://img.example.com/mo-w.jpg");
        assertThat(last.items()).extracting(FeedPhotoResponse::imageUrl)
                .containsExactlyInAnyOrder("https://img.example.com/mo-m-last.jpg", "https://img.example.com/mo-v-last.jpg");
        assertThat(last.items()).allSatisfy(p -> assertThat(p.recordDate()).isEqualTo(lastMonthDay));
        assertThat(now.items()).isSortedAccordingTo(
                java.util.Comparator.comparing(FeedPhotoResponse::recordDate)
                        .thenComparing(FeedPhotoResponse::createdAt)
                        .reversed());
        assertThat(now.truncated()).isFalse();

        // 필터는 목록과 같다 — 작성자·소스
        assertThat(feedService.photoMonth(c[0], thisMonth.minusMonths(1).toString(), null, "partner").items())
                .extracting(FeedPhotoResponse::imageUrl).containsExactly("https://img.example.com/mo-v-last.jpg");
        assertThat(feedService.photoMonth(c[0], thisMonth.toString(), List.of(FeedItemType.WORKOUT), null).items())
                .extracting(FeedPhotoResponse::type).containsExactly(FeedItemType.WORKOUT);
        // 생략하면 이번 달
        assertThat(feedService.photoMonth(c[0], null, null, null).month()).isEqualTo(thisMonth.toString());
    }

    @Test
    void 달_형식이_틀리면_거절한다() {
        long[] c = couple("ph-month-bad-a@fitto.com", "ph-month-bad-b@fitto.com");
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> feedService.photoMonth(c[0], "2026-13", null, null))
                .isInstanceOf(com.fitto.common.exception.BusinessException.class);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> feedService.photoMonth(c[0], "2026/10", null, null))
                .isInstanceOf(com.fitto.common.exception.BusinessException.class);
    }

    /**
     * 뷰어 반응 — 사진첩 응답에 타임라인과 같은 반응 요약이 실리고, 남긴 반응은 (type, refId) 로
     * 같은 행이라 목록·달력 어디서 봐도 같다. mine 은 보는 사람 기준.
     */
    @Test
    void 사진첩_항목에_반응_요약이_실린다() {
        long[] c = couple("ph-react-a@fitto.com", "ph-react-b@fitto.com");
        workoutWithPhoto(c[0], "https://img.example.com/rx-w.jpg");
        FeedPhotoResponse w = feedService.photos(c[0], null, 20, null).items().get(0);
        assertThat(w.reactions()).isEmpty();

        feedService.toggleReaction(c[1], w.type(), w.refId(), "❤️");

        FeedPhotoResponse mineView = feedService.photos(c[0], null, 20, null).items().get(0);
        assertThat(mineView.reactions()).singleElement().satisfies(r -> {
            assertThat(r.emoji()).isEqualTo("❤️");
            assertThat(r.count()).isEqualTo(1);
            assertThat(r.mine()).isFalse();
        });
        FeedPhotoResponse partnerView = feedService.photoMonth(c[1], null, null, null).items().get(0);
        assertThat(partnerView.reactions()).singleElement().satisfies(r -> assertThat(r.mine()).isTrue());
    }

    /**
     * 지도 — 좌표가 있는 장소에 걸린 사진만, 장소별로. 맛집 방문 사진과 장소를 붙인 끼니 사진이 대상이고,
     * 끼니에서 파생된 방문은 끼니 항목(MEAL)으로 실린다(그리드와 같은 식별자). 좌표 없는 장소·일상·운동은 빠진다.
     */
    @Test
    void 지도는_좌표가_있는_장소의_사진을_장소별로_묶는다() {
        long[] c = couple("ph-map-a@fitto.com", "ph-map-b@fitto.com");
        java.math.BigDecimal lat = new java.math.BigDecimal("37.5665000");
        java.math.BigDecimal lng = new java.math.BigDecimal("126.9780000");
        Long seoul = placeService.save(c[0], new SavePlaceRequest("시청 국밥", null, lat, lng, null)).id();
        Long nowhere = placeService.save(c[0], new SavePlaceRequest("좌표 없는 집", null, null, null, null)).id();
        placeService.recordVisit(c[0], seoul,
                new RecordVisitRequest(LocalDate.now().minusDays(1), 5, null, "https://img.example.com/map-v.jpg", null));
        Long mealId = mealWithPhoto(c[1], "https://img.example.com/map-m.jpg", false);
        placeService.recordVisit(c[1], seoul,
                new RecordVisitRequest(LocalDate.now(), 4, null, "https://img.example.com/map-m.jpg", mealId));
        placeService.recordVisit(c[0], nowhere,
                new RecordVisitRequest(LocalDate.now(), 3, null, "https://img.example.com/map-x.jpg", null));
        feedService.createPost(c[0], new CreatePostRequest("일상", "https://img.example.com/map-p.jpg"));

        com.fitto.feed.dto.FeedPhotoMapResponse map = feedService.photoMap(c[0], null, null);

        assertThat(map.places()).singleElement().satisfies(pl -> {
            assertThat(pl.placeId()).isEqualTo(seoul);
            assertThat(pl.name()).isEqualTo("시청 국밥");
            assertThat(pl.lat()).isEqualTo(37.5665);
            // 최신(기록일) 먼저 — 오늘 끼니, 어제 방문. 파생 방문은 끼니로 한 번만
            assertThat(pl.items()).extracting(FeedPhotoResponse::type)
                    .containsExactly(FeedItemType.MEAL, FeedItemType.PLACE_VISIT);
            assertThat(pl.items()).allSatisfy(i -> assertThat(i.placeId()).isEqualTo(seoul));
        });
        // 필터는 목록과 같다
        assertThat(feedService.photoMap(c[0], null, "me").places()).singleElement()
                .satisfies(pl -> assertThat(pl.items()).extracting(FeedPhotoResponse::type)
                        .containsExactly(FeedItemType.PLACE_VISIT));
        assertThat(feedService.photoMap(c[0], List.of(FeedItemType.MEAL), null).places()).singleElement()
                .satisfies(pl -> assertThat(pl.items()).extracting(FeedPhotoResponse::type)
                        .containsExactly(FeedItemType.MEAL));
        assertThat(feedService.photoMap(c[0], List.of(FeedItemType.POST), null).places()).isEmpty();
    }
}
