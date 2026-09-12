package com.fitto.workout;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutResponse;
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

/**
 * 운동 자동 공유 — 저장하는 순간 커플 채팅에 WORKOUT_CARD 가 남는다(별도 "공유하기" 없음).
 * 문구 규칙은 프론트 workoutShare.ts 에서 옮겨온 것이라 PR 접두어가 정확히 같아야 한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class WorkoutAutoShareFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WorkoutService workoutService;
    @Autowired ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private static SaveWorkoutRequest bench(LocalDate date, String kg) {
        return new SaveWorkoutRequest(date, null, 40, null,
                List.of(new WorkoutSetRequest("벤치프레스", "근력", 3, 10, new BigDecimal(kg), 1)));
    }

    @Test
    void 커플이_연결돼_있으면_저장만으로_채팅에_운동_카드가_남는다() {
        Long a = register("as1@fitto.com");
        Long b = register("as2@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse couple = relationService.connectCouple(b, invite.code());

        WorkoutResponse saved = workoutService.save(a, bench(LocalDate.now(), "40.00"));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        ChatMessageResponse card = messages.get(0);
        assertThat(card.messageType()).isEqualTo(MessageType.WORKOUT_CARD);
        assertThat(card.senderId()).isEqualTo(a);
        assertThat(card.workoutId()).isEqualTo(saved.id());
        assertThat(card.content()).isEqualTo("벤치프레스 · 40분");
    }

    @Test
    void PR이면_카드가_PR_접두어로_시작한다() {
        Long a = register("as3@fitto.com");
        Long b = register("as4@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse couple = relationService.connectCouple(b, invite.code());

        workoutService.save(a, bench(LocalDate.now().minusDays(1), "40.00"));
        workoutService.save(a, bench(LocalDate.now(), "42.50"));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(2);
        // getMessages 는 최신순
        assertThat(messages.get(0).content()).isEqualTo("🔥 PR 갱신! 벤치프레스 40kg → 42.5kg · 벤치프레스 · 40분");
        assertThat(messages.get(1).content()).isEqualTo("벤치프레스 · 40분");
    }

    @Test
    void 커플이_없으면_카드_없이_저장만_된다() {
        Long solo = register("as5@fitto.com");
        WorkoutResponse saved = workoutService.save(solo, bench(LocalDate.now(), "40.00"));
        assertThat(saved.id()).isNotNull();
        assertThat(workoutService.findToday(solo)).hasSize(1);
    }

    @Test
    void 사진만_있는_기록도_빈_카드가_아니다() {
        Long a = register("as6@fitto.com");
        Long b = register("as7@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse couple = relationService.connectCouple(b, invite.code());

        workoutService.save(a, new SaveWorkoutRequest(LocalDate.now(), null, null, null, null,
                "https://res.cloudinary.com/demo/image/upload/proof.jpg", List.of()));

        List<ChatMessageResponse> messages = chatService.getMessages(b, couple.id(), null);
        assertThat(messages).hasSize(1);
        assertThat(messages.get(0).content()).isEqualTo("운동 완료");
    }
}
