package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.place.domain.PlaceStatus;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripDetailResponse;
import com.fitto.trip.dto.TripResponse;
import com.fitto.trip.dto.UpdateTripRequest;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;

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
                new RegisterRequest(email, "password123", "테스터", null, null)).user().id();
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
}
