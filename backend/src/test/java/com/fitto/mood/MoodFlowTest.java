package com.fitto.mood;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.dto.MoodResponse;
import com.fitto.mood.service.MoodService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 무드 상태 통합 플로우 — H2 기반. PLAN.md "무드 상태" 참고. */
@SpringBootTest
@ActiveProfiles("test")
class MoodFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    MoodService moodService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false), "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    @Test
    void 무드를_설정하면_상대가_바로_조회할_수_있다() {
        Long a = register("mood-a@fitto.com");
        Long b = register("mood-b@fitto.com");
        connectCouple(a, b);

        MoodResponse afterA = moodService.set(a, new MoodRequest("😊", null));
        assertThat(afterA.mine().emoji()).isEqualTo("😊");
        assertThat(afterA.partner()).isNull(); // 상대는 아직 설정 안 함

        MoodResponse fromB = moodService.current(b);
        assertThat(fromB.mine()).isNull();
        assertThat(fromB.partner().emoji()).isEqualTo("😊");
    }

    @Test
    void 짧은_메모를_함께_남길_수_있다() {
        Long a = register("mood-c@fitto.com");
        Long b = register("mood-d@fitto.com");
        connectCouple(a, b);

        MoodResponse response = moodService.set(a, new MoodRequest("😴", "야근 중"));
        assertThat(response.mine().message()).isEqualTo("야근 중");
    }

    /** 무드는 원장(로그) 방식 — 같은 날 여러 번 바꿔도 매번 새로 쌓이고, 최신 것만 보인다. */
    @Test
    void 하루에_여러_번_바꿀_수_있고_최신_것만_보인다() {
        Long a = register("mood-e@fitto.com");
        Long b = register("mood-f@fitto.com");
        connectCouple(a, b);

        moodService.set(a, new MoodRequest("😊", null));
        MoodResponse latest = moodService.set(a, new MoodRequest("😢", null));

        assertThat(latest.mine().emoji()).isEqualTo("😢");
        assertThat(moodService.current(a).mine().emoji()).isEqualTo("😢");
    }

    @Test
    void 커플이_아니면_무드를_쓸_수_없다() {
        Long solo = register("mood-g@fitto.com");

        assertThatThrownBy(() -> moodService.set(solo, new MoodRequest("😊", null)))
                .isInstanceOf(BusinessException.class);
    }
}
