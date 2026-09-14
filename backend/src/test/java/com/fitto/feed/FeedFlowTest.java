package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;

/** 커플 일상 피드 통합 플로우 (PLAN.md Couple Feed) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class FeedFlowTest {

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
    /** 스파이 — 테스트 프로필은 Cloudinary 미설정이라 실제 삭제는 no-op, 어떤 URL 을 넘기는지만 본다 */
    @MockitoSpyBean
    CloudinaryImageDeleter imageDeleter;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    @Test
    void 글과_사진이_모두_없으면_포스트를_만들_수_없다() {
        long[] c = couple("f1@fitto.com", "f2@fitto.com");
        assertThatThrownBy(() -> feedService.createPost(c[0], new CreatePostRequest("  ", null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 커플이_아니면_피드를_쓸_수_없다() {
        Long solo = register("f3@fitto.com");
        assertThatThrownBy(() -> feedService.createPost(solo, new CreatePostRequest("혼자", null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 타임라인은_포스트와_운동_식단을_한_피드로_병합한다() {
        long[] c = couple("f4@fitto.com", "f5@fitto.com");

        feedService.createPost(c[0], new CreatePostRequest("한강 러닝 최고 🌇", null));
        workoutService.save(c[1], new SaveWorkoutRequest(LocalDate.now(), null, 30, null,
                List.of(new WorkoutSetRequest("러닝", "유산소", 1, null, null, 1))));
        mealService.save(c[0], new SaveMealRequest(LocalDate.now(), MealType.DINNER, "회식", null, 800, null, null, null, null, null, null, null));

        FeedTimelineResponse timeline = feedService.timeline(c[0], null, 20);
        List<FeedItemType> types = timeline.items().stream().map(FeedItemResponse::type).toList();
        assertThat(types).contains(FeedItemType.POST, FeedItemType.WORKOUT, FeedItemType.MEAL);
        // 상대(파트너)의 기록도 mine=false 로 포함된다
        assertThat(timeline.items()).anyMatch(i -> i.type() == FeedItemType.WORKOUT && !i.mine());
    }

    /**
     * 운동 인증샷은 <b>애인에게도 보이지 않는다</b> — 커플 피드에 이미지가 실리지 않는다.
     *
     * <p>인증샷은 대개 다른 앱의 완료 화면 캡처이고, 러닝 앱 화면에는 <b>달린 경로 지도</b>가
     * 함께 찍혀 있다. 즉 집 근처 동선이 그대로 담긴 사진이다. 이걸 "커플 콘텐츠니까"라며
     * 자동으로 피드에 흘리면, 사용자는 자기가 무엇을 공개했는지 모른 채 위치를 공유하게 된다.
     * 공유하고 싶으면 사진을 직접 피드 포스트로 올리면 된다 — 그건 명시적인 행동이다.
     *
     * <p>이 테스트는 나중에 "운동 카드에도 사진을 붙이자"는 개선이 들어올 때 <b>실패해서</b>
     * 그 결정을 의식적으로 하게 만드는 것이 목적이다.
     */
    @Test
    void 운동_인증샷은_커플_피드에_노출되지_않는다() {
        long[] c = couple("fwphoto1@fitto.com", "fwphoto2@fitto.com");
        String screenshot = "https://res.cloudinary.com/demo/image/upload/strava-map.jpg";

        workoutService.save(c[1], new SaveWorkoutRequest(LocalDate.now(), null, 32, null, null,
                screenshot, List.of()));

        FeedItemResponse workout = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.WORKOUT)
                .findFirst().orElseThrow();
        assertThat(workout.imageUrl()).isNull();
        assertThat(workout.imageUrls()).isEmpty();
    }

    /**
     * 제목이 <b>음식</b>을, 부제가 끼니·칼로리를 받는다.
     *
     * <p>예전에는 반대였다 — 제목이 늘 "저녁 식단 🍽️" 고정이고 음식은 회색 부제로 밀려 있어,
     * 타임라인을 내리면 같은 글자만 반복해 읽혔다. 굵게 읽히는 자리에 실제 기록을 둔다.
     */
    @Test
    void 식단_카드는_음식을_제목으로_끼니와_칼로리를_부제로_보여준다() {
        long[] c = couple("fm1@fitto.com", "fm2@fitto.com");
        mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, null, null, null, null, null, null, null, null, null, List.of(
                        new MealItemRequest("삼겹살", "1인분", 500, 0, 30, 40),
                        new MealItemRequest("공기밥", "1공기", 300, 90, 6, 1),
                        new MealItemRequest("김치", "조금", 20, 4, 1, 0))));

        FeedItemResponse meal = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.MEAL).findFirst().orElseThrow();

        assertThat(meal.title()).isEqualTo("삼겹살 외 2개");
        // 칼로리는 부제에서 빠진다 — 피드는 자동 노출이라 매 끼니 감시가 된다(FeedItemMapper 주석)
        assertThat(meal.content()).isEqualTo("저녁");
        assertThat(meal.content()).doesNotContain("kcal");
        assertThat(meal.shared()).isFalse();
    }

    @Test
    void 항목이_없는_식단_카드는_메모를_제목으로_쓴다() {
        long[] c = couple("fm3@fitto.com", "fm4@fitto.com");
        mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "회식", null, 800, null, null, null, null, null, null, null));

        FeedItemResponse meal = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.MEAL).findFirst().orElseThrow();

        assertThat(meal.title()).isEqualTo("회식");
        assertThat(meal.content()).isEqualTo("점심");
    }

    /**
     * 운동도 식단과 같은 규칙 — 제목에 종목, 부제에 분량.
     *
     * <p>분량은 세트 수와 총 볼륨(무게 × 횟수 × 세트)이다. 예전 부제는 종목 수와 시간뿐이라
     * "얼마나 했는지"가 빠져 있었다.
     */
    @Test
    void 운동_카드는_종목을_제목으로_세트와_볼륨을_부제로_보여준다() {
        long[] c = couple("fwv1@fitto.com", "fwv2@fitto.com");
        workoutService.save(c[0], new SaveWorkoutRequest(LocalDate.now(), null, 40, null,
                List.of(new WorkoutSetRequest("벤치프레스", "가슴", 4, 10, new BigDecimal("60"), 1),
                        new WorkoutSetRequest("스쿼트", "하체", 3, 10, new BigDecimal("80"), 2))));

        FeedItemResponse workout = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.WORKOUT).findFirst().orElseThrow();

        assertThat(workout.title()).isEqualTo("벤치프레스 외 1개");
        // 4×10×60 + 3×10×80 = 4,800
        assertThat(workout.content()).isEqualTo("7세트 · 4,800kg · 40분");
    }

    /** 유산소만 한 날은 볼륨이 0 이다 — "0kg" 을 적으면 안 한 게 아니라 못 한 것처럼 읽힌다. */
    @Test
    void 유산소만_한_운동_카드에는_볼륨을_적지_않는다() {
        long[] c = couple("fwc1@fitto.com", "fwc2@fitto.com");
        workoutService.save(c[0], new SaveWorkoutRequest(LocalDate.now(), null, 30, null,
                List.of(new WorkoutSetRequest("러닝", "유산소", 1, null, null, 1))));

        FeedItemResponse workout = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.WORKOUT).findFirst().orElseThrow();

        assertThat(workout.content()).isEqualTo("1세트 · 30분");
    }

    /**
     * 데이트 식단(같이 먹기)은 커플 양쪽에 짝으로 저장되지만, 타임라인은 두 사람의 기록을
     * 함께 읽으므로 그대로 두면 같은 한 끼가 카드 두 장으로 나온다 — 원본 한 장만 싣는다.
     */
    @Test
    void 데이트_식단은_카드_한_장으로만_나온다() {
        long[] c = couple("fshare1@fitto.com", "fshare2@fitto.com");
        mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.DINNER, "파스타", null, 900, null, null, null,
                null, null, null, null, true));

        // 등록한 쪽과 상대 쪽 어느 화면에서 봐도 한 장이다
        for (long viewer : c) {
            List<FeedItemResponse> meals = feedService.timeline(viewer, null, 20).items().stream()
                    .filter(i -> i.type() == FeedItemType.MEAL).toList();
            assertThat(meals).hasSize(1);
            assertThat(meals.get(0).shared()).isTrue();
        }
    }

    /**
     * 어디서 먹었는지는 "무엇을 먹었는지" 다음으로 궁금한 값인데, 지금까지 럽슐랭 탭으로
     * 따로 찾아가야만 볼 수 있었다 — 식단 카드 부제에 함께 싣는다.
     */
    @Test
    void 식단_카드는_연결된_장소를_부제에_보여준다() {
        long[] c = couple("fmp1@fitto.com", "fmp2@fitto.com");
        Long mealId = mealService.save(c[0], new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "파스타", null, 700, null, null, null,
                null, null, null, null)).id();
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "트라토리아", "연남동", null, null, "양식")).id();
        placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.now(), 5, null, null, mealId));

        FeedItemResponse meal = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.MEAL).findFirst().orElseThrow();

        assertThat(meal.content()).isEqualTo("점심 · 📍트라토리아");
    }

    @Test
    void 이모지_반응은_토글된다() {
        long[] c = couple("f6@fitto.com", "f7@fitto.com");
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("점심 뭐 먹지", null));

        List<ReactionSummary> added = feedService.toggleReaction(c[1], FeedItemType.POST, post.refId(), "❤️");
        assertThat(added).anyMatch(r -> r.emoji().equals("❤️") && r.count() == 1);

        List<ReactionSummary> removed = feedService.toggleReaction(c[1], FeedItemType.POST, post.refId(), "❤️");
        assertThat(removed).noneMatch(r -> r.emoji().equals("❤️"));
    }

    @Test
    void 사진_여러_장을_올리면_대표_사진과_전체_목록이_모두_채워진다() {
        long[] c = couple("fp1@fitto.com", "fp2@fitto.com");
        List<String> photos = List.of(
                "https://img.example.com/1.jpg", "https://img.example.com/2.jpg", "https://img.example.com/3.jpg");

        FeedItemResponse created = feedService.createPost(c[0], new CreatePostRequest(null, null, photos));
        assertThat(created.imageUrl()).isEqualTo(photos.get(0));
        assertThat(created.imageUrls()).containsExactlyElementsOf(photos);

        // 타임라인 재조회에서도(배치 조회 경로) 순서가 그대로 유지된다
        FeedItemResponse fromTimeline = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.POST).findFirst().orElseThrow();
        assertThat(fromTimeline.imageUrls()).containsExactlyElementsOf(photos);
    }

    @Test
    void 사진은_최대_5장까지만_허용된다() {
        long[] c = couple("fp3@fitto.com", "fp4@fitto.com");
        List<String> tooMany = List.of("1", "2", "3", "4", "5", "6").stream()
                .map(n -> "https://img.example.com/" + n + ".jpg").toList();

        assertThatThrownBy(() -> feedService.createPost(c[0], new CreatePostRequest(null, null, tooMany)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 옛_클라이언트의_단일_imageUrl도_그대로_동작한다() {
        long[] c = couple("fp5@fitto.com", "fp6@fitto.com");
        FeedItemResponse created = feedService.createPost(c[0], new CreatePostRequest("옛 버전", "https://img.example.com/old.jpg"));

        assertThat(created.imageUrl()).isEqualTo("https://img.example.com/old.jpg");
        assertThat(created.imageUrls()).containsExactly("https://img.example.com/old.jpg");
    }

    @Test
    void 포스트는_작성자만_삭제할_수_있다() {
        long[] c = couple("f8@fitto.com", "f9@fitto.com");
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("삭제 테스트", null));

        assertThatThrownBy(() -> feedService.deletePost(c[1], post.refId()))
                .isInstanceOf(BusinessException.class);

        feedService.deletePost(c[0], post.refId());
        assertThat(feedService.timeline(c[0], null, 20).items())
                .noneMatch(i -> i.type() == FeedItemType.POST);
    }

    /**
     * 사진 여러 장인 글을 지우면 feed_post_photos 는 CASCADE 로 사라진다 — 그 전에 URL 을 모아
     * Cloudinary 삭제에 넘겨야 자산이 고아로 남지 않는다(2026-09-08 점검 #7).
     */
    @Test
    void 포스트를_지우면_사진_URL_전부를_이미지_삭제에_넘긴다() {
        long[] c = couple("fp-del-a@fitto.com", "fp-del-b@fitto.com");
        List<String> photos = List.of(
                "https://img.example.com/d1.jpg", "https://img.example.com/d2.jpg", "https://img.example.com/d3.jpg");
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("사진 셋", null, photos));

        feedService.deletePost(c[0], post.refId());

        // 대표(image_url = photos[0])가 한 번 더 들어간다 — 삭제는 멱등이라 걸러내지 않는다
        verify(imageDeleter).deleteAllAfterCommit(List.of(
                "https://img.example.com/d1.jpg",
                "https://img.example.com/d1.jpg", "https://img.example.com/d2.jpg", "https://img.example.com/d3.jpg"));
    }
}
