package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.place.domain.PlaceStatus;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.ReorderTripItemsRequest;
import com.fitto.trip.dto.SaveTripItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripDayResponse;
import com.fitto.trip.dto.TripDetailResponse;
import com.fitto.trip.dto.TripItemResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.dto.UpdateTripItemRequest;
import com.fitto.trip.dto.UpdateTripRequest;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 통합 플로우 (PLAN.md Trip) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    PlaceService placeService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null), "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private SaveTripRequest jeju() {
        return new SaveTripRequest("제주도 2박 3일",
                LocalDate.now().plusDays(30), LocalDate.now().plusDays(32), null, null);
    }

    @Test
    void 종료일이_시작일보다_빠르면_만들_수_없다() {
        long[] c = couple("tr1@fitto.com", "tr2@fitto.com");
        assertThatThrownBy(() -> tripService.save(c[0],
                new SaveTripRequest("역행", LocalDate.now(), LocalDate.now().minusDays(1), null, null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 여행을_만들면_커플_둘_다_목록에서_본다() {
        long[] c = couple("tr3@fitto.com", "tr4@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());
        assertThat(trip.placeCount()).isZero();

        assertThat(tripService.list(c[0])).hasSize(1);
        assertThat(tripService.list(c[1])).hasSize(1); // 파트너도 동일하게 조회
    }

    @Test
    void 장소를_담고_빼면_상세에_반영된다() {
        long[] c = couple("tr5@fitto.com", "tr6@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());
        PlaceResponse place = placeService.save(c[1], new SavePlaceRequest(
                "흑돼지 맛집", "제주시", null, null, "한식", PlaceStatus.WISHLIST));

        tripService.attachPlace(c[0], trip.id(), place.id()); // 상대가 등록한 장소도 담기 가능
        TripDetailResponse detail = tripService.detail(c[1], trip.id());
        assertThat(detail.trip().placeCount()).isEqualTo(1);
        assertThat(detail.places()).hasSize(1);
        assertThat(detail.places().get(0).tripId()).isEqualTo(trip.id());

        tripService.detachPlace(c[0], trip.id(), place.id());
        assertThat(tripService.detail(c[0], trip.id()).places()).isEmpty();
    }

    @Test
    void 여행을_삭제해도_장소는_맛집_지도에_남는다() {
        long[] c = couple("tr7@fitto.com", "tr8@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());
        PlaceResponse place = placeService.save(c[0], new SavePlaceRequest(
                "카페", null, null, null, "카페", PlaceStatus.WISHLIST));
        tripService.attachPlace(c[0], trip.id(), place.id());

        tripService.delete(c[0], trip.id());

        assertThat(tripService.list(c[0])).isEmpty();
        assertThat(placeService.list(c[0]))
                .anyMatch(p -> p.id().equals(place.id()) && p.tripId() == null);
    }

    @Test
    void 다른_커플의_여행은_수정할_수_없다() {
        long[] c1 = couple("tr9@fitto.com", "tr10@fitto.com");
        long[] c2 = couple("tr11@fitto.com", "tr12@fitto.com");
        TripResponse trip = tripService.save(c1[0], jeju());

        assertThatThrownBy(() -> tripService.update(c2[0], trip.id(),
                new UpdateTripRequest("해킹", null, null, null, null)))
                .isInstanceOf(BusinessException.class);
    }

    // ---- 일자별 일정표 (Itinerary) ----

    @Test
    void 상세는_여행_기간만큼_Day를_돌려준다() {
        long[] c = couple("ti1@fitto.com", "ti2@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju()); // 2박 3일 → 3일치

        TripDetailResponse detail = tripService.detail(c[0], trip.id());
        assertThat(detail.days()).hasSize(3);
        assertThat(detail.days().get(0).dayNo()).isEqualTo(1);
        assertThat(detail.days().get(0).items()).isEmpty();
    }

    @Test
    void 일정을_추가하면_해당_Day에_시간순으로_담긴다() {
        long[] c = couple("ti3@fitto.com", "ti4@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());

        tripService.addItem(c[0], trip.id(), new SaveTripItemRequest(
                1, null, "공항 도착", LocalTime.of(9, 0), "이동", null));
        // 상대(c[1])도 같은 여행에 일정 추가 가능
        tripService.addItem(c[1], trip.id(), new SaveTripItemRequest(
                1, null, "점심 흑돼지", LocalTime.of(12, 0), "식사", null));

        List<TripDayResponse> days = tripService.items(c[0], trip.id());
        assertThat(days.get(0).items()).hasSize(2);
        assertThat(days.get(0).items().get(0).title()).isEqualTo("공항 도착");
        assertThat(days.get(0).items().get(0).sortOrder()).isZero();
        assertThat(days.get(0).items().get(1).sortOrder()).isEqualTo(1);
    }

    @Test
    void 여행_기간을_벗어난_Day에는_일정을_넣을_수_없다() {
        long[] c = couple("ti5@fitto.com", "ti6@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju()); // 3일치

        assertThatThrownBy(() -> tripService.addItem(c[0], trip.id(),
                new SaveTripItemRequest(4, null, "없는 날", null, null, null)))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 순서_변경은_Day와_정렬을_재배치한다() {
        long[] c = couple("ti7@fitto.com", "ti8@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());
        TripItemResponse a = tripService.addItem(c[0], trip.id(),
                new SaveTripItemRequest(1, null, "A", null, null, null));
        TripItemResponse b = tripService.addItem(c[0], trip.id(),
                new SaveTripItemRequest(1, null, "B", null, null, null));

        // B 를 2일차 맨 앞으로, A 를 1일차 그대로
        tripService.reorderItems(c[0], trip.id(), new ReorderTripItemsRequest(List.of(
                new ReorderTripItemsRequest.Entry(b.id(), 2, 0),
                new ReorderTripItemsRequest.Entry(a.id(), 1, 0))));

        List<TripDayResponse> days = tripService.items(c[0], trip.id());
        assertThat(days.get(0).items()).extracting(TripItemResponse::title).containsExactly("A");
        assertThat(days.get(1).items()).extracting(TripItemResponse::title).containsExactly("B");
    }

    @Test
    void 장소를_연결한_일정은_좌표를_함께_돌려준다() {
        long[] c = couple("ti9@fitto.com", "ti10@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());
        PlaceResponse place = placeService.save(c[0], new SavePlaceRequest(
                "성산일출봉", "서귀포시", new java.math.BigDecimal("33.4580000"),
                new java.math.BigDecimal("126.9420000"), "관광", PlaceStatus.WISHLIST));

        TripItemResponse item = tripService.addItem(c[0], trip.id(), new SaveTripItemRequest(
                2, place.id(), "성산일출봉 등반", LocalTime.of(10, 0), "관광", null));

        assertThat(item.placeId()).isEqualTo(place.id());
        assertThat(item.placeName()).isEqualTo("성산일출봉");
        assertThat(item.lat()).isNotNull();
    }

    @Test
    void 다른_커플의_일정_항목은_삭제할_수_없다() {
        long[] c1 = couple("ti11@fitto.com", "ti12@fitto.com");
        long[] c2 = couple("ti13@fitto.com", "ti14@fitto.com");
        TripResponse trip = tripService.save(c1[0], jeju());
        TripItemResponse item = tripService.addItem(c1[0], trip.id(),
                new SaveTripItemRequest(1, null, "우리 일정", null, null, null));

        assertThatThrownBy(() -> tripService.deleteItem(c2[0], trip.id(), item.id()))
                .isInstanceOf(BusinessException.class);
    }

    // ---- AI 일정 생성 ----

    @Test
    void AI_일정_생성은_소유권_확인_후_AI_설정을_요구한다() {
        // 테스트 프로파일엔 Gemini 키가 없어, 소유 여행이면 AI 미설정 에러까지 도달한다
        long[] c = couple("ai1@fitto.com", "ai2@fitto.com");
        TripResponse trip = tripService.save(c[0], jeju());

        assertThatThrownBy(() -> tripService.generateItinerary(c[0], trip.id(), "맛집 위주로"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.AI_NOT_CONFIGURED);
    }

    @Test
    void 다른_커플의_여행엔_AI_일정을_생성할_수_없다() {
        // 소유권 검사가 AI 게이트보다 먼저 — FORBIDDEN 이 나야 한다
        long[] c1 = couple("ai3@fitto.com", "ai4@fitto.com");
        long[] c2 = couple("ai5@fitto.com", "ai6@fitto.com");
        TripResponse trip = tripService.save(c1[0], jeju());

        assertThatThrownBy(() -> tripService.generateItinerary(c2[0], trip.id(), null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
