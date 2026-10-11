package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
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
 * 럽슐랭 자동 공유 — 찜·방문·첫 평점·등극이 커플 채팅에 PLACE_CARD 로 남고, 한 행동이 연쇄로 내는
 * 이벤트는 마지막 카드에 접힌다(ChatService.foldOrPostPlaceCard). docs/AUTO_SHARE_LOVELICHELIN_ANALYSIS_2026-09-13.md.
 */
@SpringBootTest
@ActiveProfiles("test")
class PlaceAutoShareFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired MealService mealService;
    @Autowired ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    /** {a, b, relationId} */
    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse r = relationService.connectCouple(b, invite.code());
        return new long[]{a, b, r.id()};
    }

    private List<ChatMessageResponse> room(long[] c) {
        return chatService.getMessages(c[1], c[2], null);
    }

    private static SavePlaceRequest italian() {
        return new SavePlaceRequest("이태리식당", "서울", null, null, "양식", "kakao-1", null);
    }

    private static SaveMealRequest pastaLunch() {
        return new SaveMealRequest(LocalDate.now(), MealType.LUNCH, null, null,
                null, null, null, null, null, null, null,
                List.of(new MealItemRequest("파스타", "1인분", 650, 80, 20, 25)), false);
    }

    private void say(long[] c, String text) {
        chatService.send(c[1], c[2], new SendMessageRequest(MessageType.TEXT, text, null, null, null, null, null));
    }

    @Test
    void 장소를_추가하면_찜_카드가_남는다() {
        long[] c = couple("ps1a@fitto.com", "ps1b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).messageType()).isEqualTo(MessageType.PLACE_CARD);
        assertThat(messages.get(0).placeId()).isEqualTo(placeId);
        assertThat(messages.get(0).senderId()).isEqualTo(c[0]);
        assertThat(messages.get(0).content()).isEqualTo("📍 이태리식당 찜! 여기 가볼래?");
    }

    @Test
    void 같은_장소를_다시_추가하면_재사용이라_카드가_없다() {
        long[] c = couple("ps2a@fitto.com", "ps2b@fitto.com");
        placeService.save(c[0], italian());
        placeService.save(c[1], italian());
        assertThat(room(c)).hasSize(1);
    }

    @Test
    void 추가_직후_별점은_찜_카드에_접히고_CTA_문구가_된다() {
        long[] c = couple("ps3a@fitto.com", "ps3b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();
        placeService.rate(c[0], placeId, new RatePlaceRequest(4, null));

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content()).isEqualTo("📍 이태리식당 ★4 · 당신의 평점이 등급을 결정해요");
        // 시스템이 접은 것이라 "수정됨" 표시가 붙지 않는다
        assertThat(messages.get(0).edited()).isFalse();
    }

    @Test
    void 사이에_대화가_있으면_접지_않고_새_카드다() {
        long[] c = couple("ps4a@fitto.com", "ps4b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();
        say(c, "오 좋아");
        placeService.rate(c[0], placeId, new RatePlaceRequest(4, null));

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(3);
        assertThat(messages.get(0).content()).isEqualTo("📍 이태리식당 ★4 · 당신의 평점이 등급을 결정해요");
        assertThat(messages.get(2).content()).isEqualTo("📍 이태리식당 찜! 여기 가볼래?");
    }

    @Test
    void 등극은_항상_새_카드로_남는다() {
        long[] c = couple("ps5a@fitto.com", "ps5b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();
        placeService.rate(c[0], placeId, new RatePlaceRequest(5, null));
        placeService.rate(c[1], placeId, new RatePlaceRequest(5, null));

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(2);
        assertThat(messages.get(0).content()).isEqualTo("👑 럽슐랭 3스타 등극! · 이태리식당");
        assertThat(messages.get(0).senderId()).isEqualTo(c[1]);
        // 두 번째 평가자는 상대 평점이 있어 CTA 카드를 만들지 않는다 — 첫 평가자의 카드가 그대로 남는다
        assertThat(messages.get(1).content()).isEqualTo("📍 이태리식당 ★5 · 당신의 평점이 등급을 결정해요");
    }

    @Test
    void 방문_기록은_사진과_메모를_실은_카드가_된다() {
        long[] c = couple("ps6a@fitto.com", "ps6b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();
        say(c, "ㄱㄱ");
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(LocalDate.now(), 4, "파스타 맛있었음",
                "https://res.cloudinary.com/demo/image/upload/pasta.jpg", null));

        ChatMessageResponse card = room(c).get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.PLACE_CARD);
        assertThat(card.content()).isEqualTo("📍 이태리식당 ★4 · 파스타 맛있었음");
        assertThat(card.imageUrl()).isEqualTo("https://res.cloudinary.com/demo/image/upload/pasta.jpg");
    }

    @Test
    void 식단_경로의_방문은_식단_카드에_덧붙고_뒤이은_첫_평점도_거기에_접힌다() {
        long[] c = couple("ps7a@fitto.com", "ps7b@fitto.com");
        // 식단 기록 화면의 장소 시트 — visiting=true 라 찜 카드가 없다
        Long placeId = placeService.save(c[0],
                new SavePlaceRequest("이태리식당", "서울", null, null, "양식", "kakao-1", true)).id();
        MealResponse meal = mealService.save(c[0], pastaLunch());
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(LocalDate.now(), 4, null, null, meal.id()));
        placeService.rate(c[0], placeId, new RatePlaceRequest(4, null));

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(1);
        ChatMessageResponse card = messages.get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.MEAL_CARD);
        assertThat(card.placeId()).isEqualTo(placeId);
        assertThat(card.content()).isEqualTo("점심 · 파스타 · 📍 이태리식당 ★4 · 당신의 평점이 등급을 결정해요");
    }

    @Test
    void 장소를_지우면_럽슐랭_카드는_삭제_표시되고_식단_카드는_참조만_끊긴다() {
        long[] c = couple("ps8a@fitto.com", "ps8b@fitto.com");
        Long placeId = placeService.save(c[0], italian()).id();
        MealResponse meal = mealService.save(c[0], pastaLunch());
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(LocalDate.now(), 4, null, null, meal.id()));

        // chat_messages.place_id → places FK(V136) — 카드를 정리하지 않으면 여기서 위반이 난다
        placeService.delete(c[0], placeId);

        List<ChatMessageResponse> messages = room(c);
        assertThat(messages).hasSize(2);
        ChatMessageResponse mealCard = messages.get(0);
        assertThat(mealCard.messageType()).isEqualTo(MessageType.MEAL_CARD);
        assertThat(mealCard.deleted()).isFalse();
        assertThat(mealCard.placeId()).isNull();
        assertThat(messages.get(1).deleted()).isTrue();
    }
}
