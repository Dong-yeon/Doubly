package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null), "127.0.0.1").user().id();
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
        mealService.save(c[0], new SaveMealRequest(LocalDate.now(), MealType.DINNER, "회식", null, 800, null, null, null));

        FeedTimelineResponse timeline = feedService.timeline(c[0], null, 20);
        List<FeedItemType> types = timeline.items().stream().map(FeedItemResponse::type).toList();
        assertThat(types).contains(FeedItemType.POST, FeedItemType.WORKOUT, FeedItemType.MEAL);
        // 상대(파트너)의 기록도 mine=false 로 포함된다
        assertThat(timeline.items()).anyMatch(i -> i.type() == FeedItemType.WORKOUT && !i.mine());
    }

    @Test
    void 이모지_반응은_토글된다() {
        long[] c = couple("f6@fitto.com", "f7@fitto.com");
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("점심 뭐 먹지", null));

        List<ReactionSummary> added = feedService.toggleReaction(c[1], post.refId(), "❤️");
        assertThat(added).anyMatch(r -> r.emoji().equals("❤️") && r.count() == 1);

        List<ReactionSummary> removed = feedService.toggleReaction(c[1], post.refId(), "❤️");
        assertThat(removed).noneMatch(r -> r.emoji().equals("❤️"));
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
}
