package com.fitto.voice;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.voice.dto.SendBoosterRequest;
import com.fitto.voice.dto.WorkoutBoosterResponse;
import com.fitto.voice.service.WorkoutBoosterService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * 운동 부스터 — 2026-08 진단 리포트 "운동 부스터"({@code Feature.WORKOUT_BOOSTER}).
 *
 * <p>핵심 계약은 <b>한 번 재생되고 소멸</b>, 그리고 <b>조회만으로는 소멸하지 않음</b>이다.
 * 조회 시점에 소비하면 네트워크가 끊겼을 때 응원이 들리지도 않은 채 사라진다.
 */
@SpringBootTest
@ActiveProfiles("test")
class WorkoutBoosterTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired WorkoutBoosterService boosterService;

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

    @Test
    void 부스터를_보내면_상대가_대기중으로_받고_알림도_간다() {
        long[] c = couple("boost-a@fitto.com", "boost-b@fitto.com");

        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/go.m4a", "화이팅!"));

        WorkoutBoosterResponse pending = boosterService.pending(c[1]);
        assertThat(pending).isNotNull();
        assertThat(pending.message()).isEqualTo("화이팅!");
        assertThat(pending.audioUrl()).endsWith("go.m4a");
        verify(notificationService).notify(eq(c[1]), eq(NotificationCategory.PARTNER),
                contains("부스터"), anyString(), anyString());
    }

    /** 보낸 사람에게는 자기 부스터가 오지 않는다 — 상대를 위한 응원이다. */
    @Test
    void 보낸_사람에게는_대기중_부스터가_없다() {
        long[] c = couple("boost-self-a@fitto.com", "boost-self-b@fitto.com");
        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/a.m4a", null));

        assertThat(boosterService.pending(c[0])).isNull();
    }

    @Test
    void 재생_완료를_찍어야_소멸한다() {
        long[] c = couple("boost-play-a@fitto.com", "boost-play-b@fitto.com");
        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/b.m4a", null));

        // 조회만으로는 사라지지 않는다 — 재생이 실패했을 때 응원이 증발하면 안 된다
        assertThat(boosterService.pending(c[1])).isNotNull();
        Long id = boosterService.pending(c[1]).id();

        boosterService.markPlayed(c[1], id);

        assertThat(boosterService.pending(c[1])).isNull();
    }

    /** 여러 개가 쌓이면 보낸 순서대로 하나씩 — 최신 것만 재생하면 나머지가 조용히 사라진다. */
    @Test
    void 여러_개가_쌓이면_오래된_것부터_하나씩_재생한다() {
        long[] c = couple("boost-queue-a@fitto.com", "boost-queue-b@fitto.com");
        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/1.m4a", "첫 번째"));
        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/2.m4a", "두 번째"));

        WorkoutBoosterResponse first = boosterService.pending(c[1]);
        assertThat(first.message()).isEqualTo("첫 번째");
        boosterService.markPlayed(c[1], first.id());

        assertThat(boosterService.pending(c[1]).message()).isEqualTo("두 번째");
    }

    @Test
    void 남의_부스터를_재생_완료로_찍을_수_없다() {
        long[] c = couple("boost-x-a@fitto.com", "boost-x-b@fitto.com");
        long[] other = couple("boost-y-a@fitto.com", "boost-y-b@fitto.com");
        boosterService.send(c[0], new SendBoosterRequest("https://res.cloudinary.com/x/c.m4a", null));
        Long id = boosterService.pending(c[1]).id();

        assertThatThrownBy(() -> boosterService.markPlayed(other[0], id))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 커플이_연결되지_않았으면_보낼_수_없다() {
        Long solo = register("boost-solo@fitto.com");

        assertThatThrownBy(() -> boosterService.send(solo,
                new SendBoosterRequest("https://res.cloudinary.com/x/d.m4a", null)))
                .isInstanceOf(BusinessException.class);
    }
}
