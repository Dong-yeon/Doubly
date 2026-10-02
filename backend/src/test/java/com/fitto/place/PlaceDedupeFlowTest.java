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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import com.fitto.place.domain.Place;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    @Autowired
    PlaceRepository placeRepository;
    @Autowired
    RelationRepository relationRepository;

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
        // 화면이 "추가했어요" 와 "이미 럽슐랭에 있어요" 를 가르는 근거
        assertThat(first.created()).isTrue();
        assertThat(second.created()).isFalse();
        assertThat(placeService.list(users[0])).hasSize(1);
        // 목록 응답에는 created 가 실리지 않는다(저장 응답 전용)
        assertThat(placeService.list(users[0]).get(0).created()).isNull();
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

    @Test
    void DB_제약_같은_커플_같은_kakaoPlaceId는_두_행이_될_수_없다() {
        long[] users = couple("dedupe6a@fitto.com", "dedupe6b@fitto.com");
        Long coupleId = coupleIdOf(users[0]);

        placeRepository.saveAndFlush(rawPlace(coupleId, "첫 행", "kakao-db-1", users[0]));

        // 앱의 findExisting 을 우회해 곧장 넣으면 V117 의 UNIQUE 가 막는다 — 동시 저장의 늦은 쪽이 겪는 일
        assertThatThrownBy(() -> placeRepository.saveAndFlush(rawPlace(coupleId, "둘째 행", "kakao-db-1", users[1])))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void DB_제약_kakaoPlaceId가_NULL인_수동_장소는_여러_개_허용된다() {
        long[] users = couple("dedupe7a@fitto.com", "dedupe7b@fitto.com");
        Long coupleId = coupleIdOf(users[0]);

        // 표준 UNIQUE 는 NULL 끼리 같다고 보지 않는다 — H2·PostgreSQL 둘 다 이걸로 확인한다
        placeRepository.saveAndFlush(rawPlace(coupleId, "직접 입력 1", null, users[0]));
        placeRepository.saveAndFlush(rawPlace(coupleId, "직접 입력 2", null, users[0]));
        placeRepository.saveAndFlush(rawPlace(coupleId, "직접 입력 3", null, users[1]));

        assertThat(placeRepository.countByCoupleId(coupleId)).isEqualTo(3);
    }

    @Test
    void 서비스_kakaoPlaceId_없는_수동_장소는_이름이_다르면_각자_생긴다() {
        long[] users = couple("dedupe8a@fitto.com", "dedupe8b@fitto.com");

        PlaceResponse a = placeService.save(users[0], new SavePlaceRequest("우리 동네 분식", null, null, null, null));
        PlaceResponse b = placeService.save(users[0], new SavePlaceRequest("옆 동네 국밥", null, null, null, null));

        assertThat(a.created()).isTrue();
        assertThat(b.created()).isTrue();
        assertThat(placeService.list(users[0])).hasSize(2);
    }

    @Test
    void 두_사람이_동시에_같은_장소를_담아도_한_행이고_둘_다_성공한다() throws Exception {
        long[] users = couple("dedupe9a@fitto.com", "dedupe9b@fitto.com");
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            // 경합은 매번 재현되지 않는다 — 여러 번 겨뤄 한 번이라도 겹치면 UNIQUE + 재조회 경로를 탄다
            for (int round = 0; round < 10; round++) {
                String kakaoId = "kakao-race-" + round;
                CountDownLatch start = new CountDownLatch(1);
                List<Future<PlaceResponse>> results = new ArrayList<>();
                for (long user : users) {
                    results.add(pool.submit(() -> {
                        start.await();
                        return placeService.save(user,
                                new SavePlaceRequest("동시에 담은 곳 " + kakaoId, null, null, null, null, kakaoId));
                    }));
                }
                start.countDown();
                Long first = results.get(0).get().id();
                Long second = results.get(1).get().id();
                assertThat(second).isEqualTo(first);
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(placeService.list(users[0])).hasSize(10);
    }

    private Long coupleIdOf(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .get(0).getId();
    }

    private static Place rawPlace(Long coupleId, String name, String kakaoPlaceId, Long addedBy) {
        return Place.builder().coupleId(coupleId).name(name).kakaoPlaceId(kakaoPlaceId).addedBy(addedBy).build();
    }
}
