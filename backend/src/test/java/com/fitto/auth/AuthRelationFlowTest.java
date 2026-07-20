package com.fitto.auth;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.user.domain.Role;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 인증 + 커플 연결 통합 플로우 검증 (phase 2) — H2 기반.
 */
@SpringBootTest
@ActiveProfiles("test")
class AuthRelationFlowTest {

    @Autowired
    AuthService authService;

    @Autowired
    RelationService relationService;

    private RegisterRequest registerReq(String email) {
        return new RegisterRequest(email, "password123", "테스터", null, null, true, true, false);
    }

    @Test
    void 회원가입_시_USER_역할과_토큰이_발급된다() {
        TokenResponse res = authService.register(registerReq("a@fitto.com"), "127.0.0.1");

        assertThat(res.accessToken()).isNotBlank();
        assertThat(res.refreshToken()).isNotBlank();
        assertThat(res.user().role()).isEqualTo(Role.USER);
        assertThat(res.user().email()).isEqualTo("a@fitto.com");
    }

    @Test
    void 중복_이메일_가입은_거부된다() {
        authService.register(registerReq("dup@fitto.com"), "127.0.0.1");

        assertThatThrownBy(() -> authService.register(registerReq("dup@fitto.com"), "127.0.0.1"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
    }

    @Test
    void 잘못된_비밀번호_로그인은_거부된다() {
        authService.register(registerReq("login@fitto.com"), "127.0.0.1");

        assertThatThrownBy(() -> authService.login(new LoginRequest("login@fitto.com", "wrongpass1"), "127.0.0.1"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void refresh_토큰으로_재발급된다() {
        TokenResponse first = authService.register(registerReq("refresh@fitto.com"), "127.0.0.1");

        TokenResponse renewed = authService.refresh(first.refreshToken(), "127.0.0.1");

        assertThat(renewed.accessToken()).isNotBlank();
        assertThat(renewed.user().email()).isEqualTo("refresh@fitto.com");
    }

    @Test
    void 커플_초대코드로_연결되고_관계가_조회된다() {
        Long userA = authService.register(registerReq("coupleA@fitto.com"), "127.0.0.1").user().id();
        Long userB = authService.register(registerReq("coupleB@fitto.com"), "127.0.0.1").user().id();

        InviteCodeResponse invite = relationService.createCoupleInvite(userA);
        assertThat(invite.code()).hasSize(6);

        RelationResponse connected = relationService.connectCouple(userB, invite.code());
        assertThat(connected.status().name()).isEqualTo("ACTIVE");
        assertThat(connected.partner().id()).isEqualTo(userA);

        // A 가 조회하면 상대방은 B
        var relationsOfA = relationService.findMyRelations(userA);
        assertThat(relationsOfA).hasSize(1);
        assertThat(relationsOfA.get(0).partner().id()).isEqualTo(userB);

        // 이미 사용된 코드 재사용 불가
        assertThatThrownBy(() -> relationService.connectCouple(userA, invite.code()))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 본인_코드로는_연결할_수_없다() {
        Long userA = authService.register(registerReq("self@fitto.com"), "127.0.0.1").user().id();
        InviteCodeResponse invite = relationService.createCoupleInvite(userA);

        assertThatThrownBy(() -> relationService.connectCouple(userA, invite.code()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVITE_CODE_INVALID);
    }
}
