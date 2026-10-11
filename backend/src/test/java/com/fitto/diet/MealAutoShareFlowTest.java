package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.NutritionGoalRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.diet.service.NutritionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 식단 자동 공유 — 저장하는 순간 커플 채팅에 MEAL_CARD 가 남는다(별도 "공유하기" 없음).
 * 운동(WorkoutAutoShareFlowTest)과 다른 점: 카드에 칼로리·단백질 g 같은 <b>수치가 실리지 않는다</b>.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealAutoShareFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired NutritionService nutritionService;
    @Autowired ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private RelationResponse connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        return relationService.connectCouple(b, invite.code());
    }

    private static SaveMealRequest lunch(String photoUrl, boolean shared, MealItemRequest... items) {
        return new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "메모", photoUrl,
                null, null, null, null, null, null, null, List.of(items), shared);
    }

    @Test
    void 저장만으로_채팅에_사진과_음식명_카드가_남고_수치는_실리지_않는다() {
        Long a = register("ms1@fitto.com");
        Long b = register("ms2@fitto.com");
        RelationResponse couple = connect(a, b);

        MealResponse saved = mealService.save(a, lunch("https://res.cloudinary.com/demo/image/upload/lunch.jpg", false,
                new MealItemRequest("파스타", "1인분", 650, 80, 20, 25),
                new MealItemRequest("샐러드", "1접시", 120, 10, 3, 8)));
        assertThat(saved.calories()).isEqualTo(770);

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        ChatMessageResponse card = messages.get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.MEAL_CARD);
        assertThat(card.senderId()).isEqualTo(a);
        assertThat(card.imageUrl()).isEqualTo("https://res.cloudinary.com/demo/image/upload/lunch.jpg");
        assertThat(card.content()).isEqualTo("점심 · 파스타, 샐러드");
        assertThat(card.content()).doesNotContain("kcal").doesNotContain("770");
    }

    @Test
    void 단백질_목표를_막_채우면_배지_문구만_붙고_g_수치는_없다() {
        Long a = register("ms3@fitto.com");
        Long b = register("ms4@fitto.com");
        RelationResponse couple = connect(a, b);
        nutritionService.setGoal(a, new NutritionGoalRequest(null, null, 30, null));

        mealService.save(a, lunch(null, false, new MealItemRequest("닭가슴살", "150g", 250, 0, 46, 6)));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content()).isEqualTo("🎯 단백질 목표 달성! · 점심 · 닭가슴살");
    }

    @Test
    void 데이트_식단은_두_사람_기록이_생겨도_카드는_한_장이다() {
        Long a = register("ms5@fitto.com");
        Long b = register("ms6@fitto.com");
        RelationResponse couple = connect(a, b);

        mealService.save(a, lunch(null, true, new MealItemRequest("피자", "1판", 1200, 150, 40, 50)));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).senderId()).isEqualTo(a);
        assertThat(messages.get(0).content()).isEqualTo("점심 (데이트) · 피자");
    }

    @Test
    void 음식명이_없으면_메모가_끼니만_있으면_끼니가_본문이다() {
        Long a = register("ms7@fitto.com");
        Long b = register("ms8@fitto.com");
        RelationResponse couple = connect(a, b);

        mealService.save(a, new SaveMealRequest(LocalDate.now(), MealType.BREAKFAST, "편의점 김밥", null,
                null, null, null, null, null, null, null, List.of(), false));
        mealService.save(a, new SaveMealRequest(LocalDate.now(), MealType.SNACK, null,
                "https://res.cloudinary.com/demo/image/upload/snack.jpg",
                null, null, null, null, null, null, null, List.of(), false));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(2);
        assertThat(messages.get(1).content()).isEqualTo("아침 · 편의점 김밥");
        assertThat(messages.get(0).content()).isEqualTo("간식");
    }

    @Test
    void 커플이_없으면_카드_없이_저장만_된다() {
        Long solo = register("ms9@fitto.com");
        MealResponse saved = mealService.save(solo, lunch(null, false, new MealItemRequest("김밥", "1줄", 300, 50, 8, 6)));
        assertThat(saved.id()).isNotNull();
        assertThat(mealService.findToday(solo)).hasSize(1);
    }

    @Test
    void 기록을_지우면_카드는_삭제_표시되고_삭제가_막히지_않는다() {
        Long a = register("ms10@fitto.com");
        Long b = register("ms11@fitto.com");
        RelationResponse couple = connect(a, b);

        MealResponse saved = mealService.save(a, lunch(null, false, new MealItemRequest("김밥", "1줄", 300, 50, 8, 6)));
        // chat_messages.meal_id → meals FK(V135) — 카드를 정리하지 않으면 여기서 위반이 난다
        mealService.delete(a, saved.id());

        assertThat(mealService.findToday(a)).isEmpty();
        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).deleted()).isTrue();
    }

    @Test
    void 데이트_식단을_한쪽이_지우면_짝과_카드가_함께_정리된다() {
        Long a = register("ms12@fitto.com");
        Long b = register("ms13@fitto.com");
        RelationResponse couple = connect(a, b);

        mealService.save(a, lunch(null, true, new MealItemRequest("피자", "1판", 1200, 150, 40, 50)));
        MealResponse partnerCopy = mealService.findToday(b).get(0);
        // 카드는 a 의 기록을 가리키지만 b 가 자기 몫을 지우면 짝(a 의 기록)까지 지워진다
        mealService.delete(b, partnerCopy.id());

        assertThat(mealService.findToday(a)).isEmpty();
        assertThat(chatService.getMessages(a, couple.id(), null).get(0).deleted()).isTrue();
    }
}
