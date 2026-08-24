package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationService;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.common.notification.NotificationCategory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 럽슐랭 재촉 푸시 — 상대가 아직 평가 전이면 내 <b>첫 평가</b> 때 한 번만 알린다.
 * 재평가는 다시 보내지 않고(스팸 방지), 등극 알림과는 상호배타적이다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PlaceRatingNudgeTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlaceService placeService;

    /** 실제 Expo 발송 대신 호출만 기록한다 — 발송 대상·문구를 그대로 검증할 수 있다. */
    @MockitoBean
    NotificationService notificationService;

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

    private Long place(Long userId) {
        return placeService.save(userId, new SavePlaceRequest("성수 브런치", null, null, null, null, null)).id();
    }

    @Test
    void 첫_평가면_아직_평가_전인_상대에게_재촉_알림이_간다() {
        long[] users = couple("ng1a@fitto.com", "ng1b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(5, true));

        verify(notificationService).notify(eq(users[1]), eq(NotificationCategory.PARTNER), contains("평가를 기다려요"), contains("성수 브런치"), anyString());
    }

    @Test
    void 재평가는_재촉_알림을_다시_보내지_않는다() {
        long[] users = couple("ng2a@fitto.com", "ng2b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(5, true));
        clearInvocations(notificationService);

        placeService.rate(users[0], placeId, new RatePlaceRequest(4, true));

        verify(notificationService, never()).notify(eq(users[1]), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 상대가_이미_평가했으면_재촉_대신_등극_알림만_간다() {
        long[] users = couple("ng3a@fitto.com", "ng3b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(5, true)); // → users[1] 에게 재촉
        clearInvocations(notificationService);

        placeService.rate(users[1], placeId, new RatePlaceRequest(5, true)); // 둘 다 5점 → 3스타 등극

        verify(notificationService).notify(eq(users[0]), eq(NotificationCategory.PARTNER), contains("등극"), anyString(), anyString());
        verify(notificationService, never()).notify(eq(users[0]), any(), contains("평가를 기다려요"), anyString(), anyString());
    }
}
