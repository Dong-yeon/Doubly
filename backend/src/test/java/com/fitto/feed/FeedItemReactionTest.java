package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 커플 응원 리액션 — 운동·식단·맛집 방문 카드에도 이모지를 단다
 * (2026-08 진단 리포트 "커플 응원 리액션").
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedItemReactionTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired WorkoutService workoutService;
    @Autowired MealService mealService;
    @Autowired PlaceService placeService;

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

    private Long workout(Long userId) {
        return workoutService.save(userId, new SaveWorkoutRequest(
                LocalDate.now(), null, 40, null,
                List.of(new WorkoutSetRequest("벤치프레스", "가슴", 3, 10, new BigDecimal("60"), 1)))).id();
    }

    private Long meal(Long userId) {
        return mealService.save(userId, new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "점심", null, 600, null, null, null,
                null, null, null, null)).id();
    }

    @Test
    void 상대의_운동_카드에_응원을_남기고_취소할_수_있다() {
        long[] c = couple("react-w-a@fitto.com", "react-w-b@fitto.com");
        Long workoutId = workout(c[0]);

        List<ReactionSummary> added = feedService.toggleReaction(c[1], FeedItemType.WORKOUT, workoutId, "💪");
        assertThat(added).anyMatch(r -> r.emoji().equals("💪") && r.count() == 1);

        List<ReactionSummary> removed = feedService.toggleReaction(c[1], FeedItemType.WORKOUT, workoutId, "💪");
        assertThat(removed).noneMatch(r -> r.emoji().equals("💪"));
    }

    @Test
    void 식단과_맛집_방문에도_반응이_달린다() {
        long[] c = couple("react-m-a@fitto.com", "react-m-b@fitto.com");
        Long mealId = meal(c[0]);
        Long placeId = placeService.save(c[0], new SavePlaceRequest(
                "성수 브런치", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null)).id();
        Long visitId = placeService.recordVisit(c[0], placeId,
                new RecordVisitRequest(LocalDate.now(), 5, "좋았다", null, null)).id();

        assertThat(feedService.toggleReaction(c[1], FeedItemType.MEAL, mealId, "😋"))
                .anyMatch(r -> r.emoji().equals("😋"));
        assertThat(feedService.toggleReaction(c[1], FeedItemType.PLACE_VISIT, visitId, "👍"))
                .anyMatch(r -> r.emoji().equals("👍"));
    }

    /** 타임라인에 반응 요약이 함께 내려와야 화면이 한 번의 조회로 그려진다. */
    @Test
    void 타임라인_운동_카드에_반응_요약이_실려_온다() {
        long[] c = couple("react-t-a@fitto.com", "react-t-b@fitto.com");
        Long workoutId = workout(c[0]);
        feedService.toggleReaction(c[1], FeedItemType.WORKOUT, workoutId, "🔥");

        FeedItemResponse card = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.WORKOUT && i.refId().equals(workoutId))
                .findFirst().orElseThrow();

        assertThat(card.reactions()).anyMatch(r -> r.emoji().equals("🔥") && r.count() == 1 && !r.mine());
    }

    /**
     * id 만 받아 저장하면 남의 기록에 반응을 남기고 그 푸시가 모르는 사람에게 간다.
     * 대상 검증은 {@code FeedService.resolveTarget} 한 곳에 모여 있다.
     */
    @Test
    void 남의_커플_기록에는_반응할_수_없다() {
        long[] mine = couple("react-x-a@fitto.com", "react-x-b@fitto.com");
        long[] theirs = couple("react-y-a@fitto.com", "react-y-b@fitto.com");
        Long theirWorkout = workout(theirs[0]);

        assertThatThrownBy(() -> feedService.toggleReaction(mine[0], FeedItemType.WORKOUT, theirWorkout, "💪"))
                .isInstanceOf(BusinessException.class);
    }

    /** 원본이 사라지면 반응도 사라져야 한다 — FK CASCADE 를 잃은 자리를 코드가 메운다(V60). */
    @Test
    void 운동_기록을_지우면_그_반응도_사라진다() {
        long[] c = couple("react-d-a@fitto.com", "react-d-b@fitto.com");
        Long workoutId = workout(c[0]);
        feedService.toggleReaction(c[1], FeedItemType.WORKOUT, workoutId, "💪");

        workoutService.delete(c[0], workoutId);

        Long reused = workout(c[0]);
        assertThat(feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.WORKOUT && i.refId().equals(reused))
                .findFirst().orElseThrow()
                .reactions()).isEmpty();
    }
}
