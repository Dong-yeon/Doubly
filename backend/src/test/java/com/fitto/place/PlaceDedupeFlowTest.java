package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 장소 등록 중복 방지 — H2 기반. 식단 기록 화면 등에서 카카오 검색 결과를 그대로
 * save() 에 다시 넘겨도(이미 등록된 맛집을 재검색해 추가하는 흔한 경로) 같은 장소가
 * 두 번 생기지 않아야 한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class PlaceDedupeFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlaceService placeService;

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

    @Test
    void 같은_kakaoPlaceId로_다시_저장하면_새로_생기지_않고_기존_장소를_돌려준다() {
        long[] users = couple("dedupe1a@fitto.com", "dedupe1b@fitto.com");

        PlaceResponse first = placeService.save(users[0],
                new SavePlaceRequest("연남 파스타집", "서울 마포구 동교로 123",
                        BigDecimal.valueOf(37.561234), BigDecimal.valueOf(126.923456), "음식점", "kakao-1"));
        // 파트너가 식단 기록 화면에서 같은 장소를 다시 검색해 추가하는 상황
        PlaceResponse second = placeService.save(users[1],
                new SavePlaceRequest("연남 파스타집", "서울 마포구 동교로 123",
                        BigDecimal.valueOf(37.561234), BigDecimal.valueOf(126.923456), "음식점", "kakao-1"));

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(placeService.list(users[0])).hasSize(1);
    }

    @Test
    void kakaoPlaceId가_없어도_이름과_좌표가_같으면_기존_장소를_재사용한다() {
        long[] users = couple("dedupe2a@fitto.com", "dedupe2b@fitto.com");

        PlaceResponse first = placeService.save(users[0],
                new SavePlaceRequest("성수 브런치", "서울 성동구", BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), null));
        PlaceResponse second = placeService.save(users[1],
                new SavePlaceRequest("성수 브런치", "주소가 달라도", BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), null));

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(placeService.list(users[0])).hasSize(1);
    }

    @Test
    void 좌표도_없으면_이름과_주소로_기존_장소를_재사용한다() {
        long[] users = couple("dedupe3a@fitto.com", "dedupe3b@fitto.com");

        PlaceResponse first = placeService.save(users[0], new SavePlaceRequest("망원동 카페", "서울 마포구 망원동", null, null, null));
        PlaceResponse second = placeService.save(users[1], new SavePlaceRequest("망원동 카페", "서울 마포구 망원동", null, null, null));

        assertThat(second.id()).isEqualTo(first.id());
        assertThat(placeService.list(users[0])).hasSize(1);
    }

    @Test
    void 이름이나_좌표가_다르면_별개_장소로_새로_생긴다() {
        long[] users = couple("dedupe4a@fitto.com", "dedupe4b@fitto.com");

        placeService.save(users[0],
                new SavePlaceRequest("연남 파스타집", "서울 마포구 동교로 123",
                        BigDecimal.valueOf(37.561234), BigDecimal.valueOf(126.923456), "음식점", "kakao-1"));
        placeService.save(users[0],
                new SavePlaceRequest("완전 다른 가게", "서울 강남구",
                        BigDecimal.valueOf(37.5), BigDecimal.valueOf(127.0), "음식점", "kakao-2"));

        assertThat(placeService.list(users[0])).hasSize(2);
    }

    @Test
    void 다른_커플이_같은_kakaoPlaceId로_저장하면_각자_따로_생긴다() {
        long[] coupleA = couple("dedupe5a1@fitto.com", "dedupe5a2@fitto.com");
        long[] coupleB = couple("dedupe5b1@fitto.com", "dedupe5b2@fitto.com");

        PlaceResponse a = placeService.save(coupleA[0],
                new SavePlaceRequest("전국구 프랜차이즈", "어딘가", null, null, null, "kakao-same"));
        PlaceResponse b = placeService.save(coupleB[0],
                new SavePlaceRequest("전국구 프랜차이즈", "어딘가", null, null, null, "kakao-same"));

        assertThat(a.id()).isNotEqualTo(b.id());
        assertThat(placeService.list(coupleA[0])).hasSize(1);
        assertThat(placeService.list(coupleB[0])).hasSize(1);
    }
}
