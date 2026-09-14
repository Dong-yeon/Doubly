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
        return mealService.save(userId, new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "점심",
                photoUrl, 600, null, null, null, null, null, null, null, shared)).id();
    }

    private void workoutWithPhoto(long userId, String imageUrl) {
        workoutService.save(userId, new SaveWorkoutRequest(LocalDate.now(), null, 30, null, null,
                imageUrl, List.of()));
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
        // 최신순 — 같은 시각이면 refId 역순(정렬 키가 (occurredAt, refId) 복합키다)
        assertThat(page.items()).isSortedAccordingTo(
                (x, y) -> y.createdAt().compareTo(x.createdAt()));
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

    @Test
    void 캡션은_기록_종류마다_타임라인과_같은_문구로_채워진다() {
        long[] c = couple("ph-caption-a@fitto.com", "ph-caption-b@fitto.com");
        mealWithPhoto(c[0], "https://img.example.com/cap-meal.jpg", false);

        FeedPhotoResponse item = feedService.photos(c[0], null, 20, List.of(FeedItemType.MEAL))
                .items().get(0);

        // 식단 캡션 = "음식(또는 메모) · 끼니 · 칼로리"
        assertThat(item.caption()).contains("점심").contains("600kcal");
        assertThat(item.authorName()).isEqualTo("나");
    }
}
