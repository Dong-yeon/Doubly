package com.fitto.relation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.service.ChatService;
import com.fitto.diet.domain.DietGoalType;
import com.fitto.diet.service.NutritionService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.service.TrainerService;
import com.fitto.user.domain.Gender;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 남에게 내려가는 사용자 정보에 개인정보가 섞이지 않는다 (LOVEBODY_REVIEW_2026-10-02 §3 A-4).
 *
 * <p>커플 상대·채팅방 상대·트레이너의 회원 목록은 예전에 본인용 {@code UserResponse} 를 그대로
 * 실어 보내, 화면에 안 그려도 API 로는 이메일·생년월일·성별·키가 보였다. 레코드 필드가 아니라
 * <b>직렬화된 JSON</b> 을 보는 이유는, 누가 DTO 를 다시 바꿔 끼워도 응답 자체로 잡히게 하려는 것이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PartnerPrivacyTest {

    /** 상대에게 보이면 안 되는 본인용 필드 — 신체 정보·계정 정보·설정 */
    private static final List<String> PRIVATE_FIELDS = List.of(
            "email", "birthDate", "gender", "heightCm", "role", "socialType",
            "marketingConsent", "notificationsEnabled", "notifyChat", "notifyAnniversary",
            "notifyPartner", "notifyReminder", "autoAnalyzeMealPhoto", "requiresConsent",
            // 식단 목표 방향(감량·유지·증량, V115) — 본인 영양 요약에만 실린다
            "goalDirection");

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    ChatService chatService;
    @Autowired
    TrainerService trainerService;
    @Autowired
    NutritionService nutritionService;
    @Autowired
    MealService mealService;
    @Autowired
    ObjectMapper objectMapper;

    /** 신체 정보까지 다 채운 사용자 — 비어 있어서 안 보이는 것과 구분하려고 값을 넣는다 */
    private Long registerWithBody(String email) {
        Long id = authService.register(
                new RegisterRequest(email, "password123", "상대", LocalDate.of(1995, 3, 1), Gender.FEMALE,
                        true, true, false), "127.0.0.1").user().id();
        authService.updateMe(id, new UpdateProfileRequest(null, null, null, null, 165));
        nutritionService.setGoalDirection(id, DietGoalType.LOSE);
        return id;
    }

    private void assertNoPrivateFields(JsonNode partner, Long expectedId) {
        assertThat(partner.get("id").asLong()).isEqualTo(expectedId);
        assertThat(partner.get("name").asText()).isEqualTo("상대");
        // null 은 직렬화에서 빠지므로(NON_NULL) 금지 필드는 값을 채운 채로 부재를 본다
        for (String field : PRIVATE_FIELDS) {
            assertThat(partner.has(field)).as("상대 응답에 %s 가 실려 있다", field).isFalse();
        }
    }

    @Test
    void 커플_상대와_채팅방_상대에는_이메일_생년월일_성별_키가_없다() {
        Long a = registerWithBody("privacyA@fitto.com");
        Long b = authService.register(
                new RegisterRequest("privacyB@fitto.com", "password123", "나", null, null, true, true, false),
                "127.0.0.1").user().id();
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        JsonNode relation = objectMapper.valueToTree(relationService.findMyRelations(b).get(0));
        assertNoPrivateFields(relation.get("partner"), a);

        JsonNode room = objectMapper.valueToTree(chatService.getRooms(b).get(0));
        assertNoPrivateFields(room.get("partner"), a);
    }

    @Test
    void 트레이너_대시보드의_회원에는_이메일_생년월일_성별_키가_없다() {
        Long trainer = authService.register(
                new RegisterRequest("privacyT@fitto.com", "password123", "코치", null, null, true, true, false),
                "127.0.0.1").user().id();
        trainerService.register(trainer, new TrainerProfileRequest("PT", "소개", null, null, 10, true));
        Long member = registerWithBody("privacyM@fitto.com");
        relationService.connectTrainer(member, relationService.createTrainerInvite(trainer).code());

        JsonNode dashboard = objectMapper.valueToTree(trainerService.dashboard(trainer));
        assertNoPrivateFields(dashboard.get("members").get(0).get("member"), member);

        // 회원 쪽에서 본 트레이너(RelationResponse.partner)도 같은 경계
        JsonNode relation = objectMapper.valueToTree(relationService.findMyRelations(member).get(0));
        assertThat(relation.get("partner").has("email")).isFalse();
    }

    /**
     * 홈 "오늘 챙김" 링(LOVEBODY_REVIEW §2-2) — 상대 오늘 식단 응답은 끼니 <b>종류</b>까지만이다. 메모·사진·칼로리·
     * 매크로는 싣지 않는다. 필드 목록을 고정해, 누가 식사 내용을 얹으면 이 테스트가 먼저 깨지게 한다.
     */
    @Test
    void 상대_오늘_식단_응답에는_끼니_종류_외_식단_정보가_없다() {
        Long a = registerWithBody("privacyMealA@fitto.com");
        Long b = authService.register(
                new RegisterRequest("privacyMealB@fitto.com", "password123", "나", null, null, true, true, false),
                "127.0.0.1").user().id();
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        String photo = "https://res.cloudinary.com/demo/image/upload/v1/fitto/private-lunch.jpg";
        mealService.save(a, new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "비밀 메모 크림파스타", photo, 987,
                111, 22, 33, null, null, null, null));

        JsonNode today = objectMapper.valueToTree(mealService.partnerToday(b));
        assertThat(today.get("mealTypes").get(0).asText()).isEqualTo("LUNCH");
        java.util.List<String> fields = new java.util.ArrayList<>();
        today.fieldNames().forEachRemaining(fields::add);
        // nudgedToday(V120)는 상대 식사가 아니라 <b>내가</b> 오늘 "뭐 먹었어?"를 보냈는지다 — 식사 정보가 아니라 허용한다
        assertThat(fields).isSubsetOf("connected", "partnerName", "completed", "mealTypes", "nudgedToday");
        assertThat(today.toString()).doesNotContain("비밀 메모").doesNotContain(photo).doesNotContain("987");
    }
}
