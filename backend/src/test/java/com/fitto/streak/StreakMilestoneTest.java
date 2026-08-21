package com.fitto.streak;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.service.ChatService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 스트릭 마일스톤 축하 — 7·30·100일을 <b>넘는 순간</b> 한 번만
 * (2026-08 진단 리포트 "스트릭 마일스톤 축하").
 */
@SpringBootTest
@ActiveProfiles("test")
class StreakMilestoneTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired RelationRepository relationRepository;
    @Autowired WorkoutService workoutService;
    @Autowired ChatService chatService;

    @MockitoBean NotificationService notificationService;

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

    private void workoutOn(Long userId, LocalDate date) {
        workoutService.save(userId, new SaveWorkoutRequest(date, null, 30, null,
                List.of(new WorkoutSetRequest("스쿼트", "하체", 3, 10, new BigDecimal("50"), 1))));
    }

    /** 개인 스트릭은 상대에게만 — 방금 저장 버튼을 누른 본인에게는 중복이다. */
    @Test
    void 개인_7일_스트릭은_상대에게만_알린다() {
        long[] c = couple("ms-solo-a@fitto.com", "ms-solo-b@fitto.com");
        LocalDate start = LocalDate.now().minusDays(6);
        for (int i = 0; i < 6; i++) {
            workoutOn(c[0], start.plusDays(i));
        }
        clearInvocations(notificationService);

        workoutOn(c[0], LocalDate.now());   // 7일째

        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.PARTNER),
                contains("7일 연속"), anyString(), anyString());
        verify(notificationService, never()).notify(eq(c[0]), any(), contains("7일 연속"), anyString(), anyString());
    }

    @Test
    void 커플_7일_스트릭은_양쪽_축하와_채팅_카드를_남긴다() {
        long[] c = couple("ms-couple-a@fitto.com", "ms-couple-b@fitto.com");
        LocalDate start = LocalDate.now().minusDays(6);
        for (int i = 0; i < 7; i++) {
            workoutOn(c[1], start.plusDays(i));      // 상대가 먼저 7일 채움
        }
        for (int i = 0; i < 6; i++) {
            workoutOn(c[0], start.plusDays(i));      // 커플 스트릭 6일
        }
        clearInvocations(notificationService);

        workoutOn(c[0], LocalDate.now());            // 커플 스트릭 7일째

        verify(notificationService).notify(eq(c[0]), eq(NotificationCategory.PARTNER),
                contains("커플 7일 연속"), anyString(), anyString());
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.PARTNER),
                contains("커플 7일 연속"), anyString(), anyString());

        Long relationId = relationRepository
                .findByUserAndTypeAndStatus(c[0], RelationType.COUPLE, RelationStatus.ACTIVE)
                .get(0).getId();
        assertThat(chatService.getMessages(c[0], relationId, null))
                .anyMatch(m -> m.messageType() == MessageType.STREAK_CARD
                        && m.content() != null && m.content().contains("7일 연속"));
    }

    /** 같은 날 여러 번 저장해도 축하는 한 번뿐이다 (currentCount 가 올라간 경우만 판정). */
    @Test
    void 같은_날_중복_저장은_다시_축하하지_않는다() {
        long[] c = couple("ms-dup-a@fitto.com", "ms-dup-b@fitto.com");
        LocalDate start = LocalDate.now().minusDays(6);
        for (int i = 0; i < 7; i++) {
            workoutOn(c[0], start.plusDays(i));
        }
        clearInvocations(notificationService);

        workoutOn(c[0], LocalDate.now());   // 같은 날 두 번째 저장

        verify(notificationService, never()).notify(eq(c[1]), any(), contains("7일 연속"), anyString(), anyString());
    }

    @Test
    void 마일스톤이_아닌_날은_축하하지_않는다() {
        long[] c = couple("ms-none-a@fitto.com", "ms-none-b@fitto.com");
        LocalDate start = LocalDate.now().minusDays(2);
        workoutOn(c[0], start);
        workoutOn(c[0], start.plusDays(1));
        clearInvocations(notificationService);

        workoutOn(c[0], LocalDate.now());   // 3일째 — 마일스톤 아님

        verify(notificationService, never()).notify(eq(c[1]), any(), contains("연속"), anyString(), anyString());
    }
}
