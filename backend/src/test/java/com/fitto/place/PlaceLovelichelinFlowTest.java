package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 럽슐랭 대표 평점 → 등급 산정 왕복 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class PlaceLovelichelinFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlaceService placeService;
    @Autowired
    PlaceRatingRepository placeRatingRepository;

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
        return placeService.save(userId, new SavePlaceRequest("성수 브런치", null, null, null, null, null, null)).id();
    }

    @Test
    void 둘_다_5점을_주면_3럽스타가_된다() {
        long[] users = couple("lc1a@fitto.com", "lc1b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(5, true));
        PlaceResponse after = placeService.rate(users[1], placeId, new RatePlaceRequest(5, true));

        assertThat(after.myRating()).isEqualTo(5);
        assertThat(after.partnerRating()).isEqualTo(5);
        assertThat(after.lovelichelinTier()).isEqualTo(3);
        assertThat(after.lovelichelinCertifiedAt()).isNotNull();
    }

    @Test
    void 한_명만_평가하면_아직_등급이_없다() {
        long[] users = couple("lc2a@fitto.com", "lc2b@fitto.com");
        Long placeId = place(users[0]);

        PlaceResponse after = placeService.rate(users[0], placeId, new RatePlaceRequest(5, null));

        assertThat(after.lovelichelinTier()).isZero();
        assertThat(after.lovelichelinCertifiedAt()).isNull();
    }

    @Test
    void 한쪽이_2점_이하면_탈락이고_상대_점수는_보존된다() {
        long[] users = couple("lc3a@fitto.com", "lc3b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(5, null));
        PlaceResponse after = placeService.rate(users[1], placeId, new RatePlaceRequest(2, null));

        assertThat(after.lovelichelinTier()).isZero();
        assertThat(after.lovelichelinCertifiedAt()).isNull();
        assertThat(after.myRating()).isEqualTo(2);
        assertThat(after.partnerRating()).isEqualTo(5);
    }

    @Test
    void 재평가하면_대표_평점이_덮어써지고_등급이_다시_계산된다() {
        long[] users = couple("lc4a@fitto.com", "lc4b@fitto.com");
        Long placeId = place(users[0]);
        placeService.rate(users[0], placeId, new RatePlaceRequest(5, null));
        placeService.rate(users[1], placeId, new RatePlaceRequest(5, null));

        PlaceResponse downgraded = placeService.rate(users[0], placeId, new RatePlaceRequest(4, null));

        assertThat(downgraded.myRating()).isEqualTo(4);
        assertThat(downgraded.lovelichelinTier()).isEqualTo(2);
        assertThat(downgraded.lovelichelinCertifiedAt()).isNotNull();
    }

    // 회귀 테스트 — 1~3 럽스타 사이를 오가는 재평가는 "새로 등극"이 아니므로 등극 시각이
    // 갱신되면 안 된다(예전엔 3→2 재평가만 해도 오늘 날짜로 밀렸다).
    @Test
    void 등극_이후_등급만_바뀌는_재평가는_등극_시각을_유지한다() {
        long[] users = couple("lc7a@fitto.com", "lc7b@fitto.com");
        Long placeId = place(users[0]);
        placeService.rate(users[0], placeId, new RatePlaceRequest(5, null));
        LocalDateTime firstCertified = placeService.rate(users[1], placeId, new RatePlaceRequest(5, null))
                .lovelichelinCertifiedAt();

        // 3 럽스타 → 2 럽스타로 재평가 — 여전히 인증 상태(tier>0)라 등극 시각은 그대로여야 한다
        LocalDateTime afterDowngrade = placeService.rate(users[0], placeId, new RatePlaceRequest(4, null))
                .lovelichelinCertifiedAt();

        // 두 번째 rate() 는 새 트랜잭션에서 place 를 다시 읽어오는데, DB TIMESTAMP 컬럼이
        // 나노초보다 낮은 정밀도로 저장해 완전히 같은 LocalDateTime.equals() 는 실패한다
        // (값 자체는 같은 시각) — 밀리초 단위로 잘라 비교한다.
        assertThat(afterDowngrade.truncatedTo(ChronoUnit.MILLIS))
                .isEqualTo(firstCertified.truncatedTo(ChronoUnit.MILLIS));
    }

    // 회귀 테스트 — revisitIntent 는 선택 응답이라, 다음 재평가에서 null 로 보내면
    // "응답 안 함"이지 "지운다"가 아니다. 이전에 남긴 응답이 조용히 사라지면 안 된다.
    @Test
    void 재평가_시_다시_올래요_응답을_비워서_보내면_이전_응답이_유지된다() {
        long[] users = couple("lc8a@fitto.com", "lc8b@fitto.com");
        Long placeId = place(users[0]);

        placeService.rate(users[0], placeId, new RatePlaceRequest(3, false));
        placeService.rate(users[0], placeId, new RatePlaceRequest(4, null));

        PlaceRating mine = placeRatingRepository.findByPlaceIdAndUserId(placeId, users[0]).orElseThrow();
        assertThat(mine.getRating()).isEqualTo(4);
        assertThat(mine.getRevisitIntent()).isFalse();
    }

    @Test
    void 커플이_아니면_평가할_수_없다() {
        Long lone = register("lc6@fitto.com");

        assertThatThrownBy(() -> placeService.rate(lone, 999L, new RatePlaceRequest(5, null)))
                .isInstanceOf(BusinessException.class);
    }
}
