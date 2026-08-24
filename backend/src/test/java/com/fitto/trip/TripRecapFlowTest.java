package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.place.domain.PlaceStatus;
import com.fitto.place.dto.PlaceResponse;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.ChecklistItemResponse;
import com.fitto.trip.dto.SaveChecklistItemRequest;
import com.fitto.trip.dto.SaveTripExpenseRequest;
import com.fitto.trip.dto.SaveTripItemRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.dto.TripRecapResponse;
import com.fitto.trip.service.TripAlbumService;
import com.fitto.trip.service.TripChecklistService;
import com.fitto.trip.service.TripExpenseService;
import com.fitto.trip.service.TripRecapService;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 회고 카드 통합 플로우 (PLAN.md Trip Recap) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripRecapFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    TripExpenseService expenseService;
    @Autowired
    TripChecklistService checklistService;
    @Autowired
    TripAlbumService albumService;
    @Autowired
    PlaceService placeService;
    @Autowired
    FeedService feedService;
    @Autowired
    TripRecapService recapService;

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

    private Long trip(Long userId) {
        return tripService.save(userId, new SaveTripRequest("제주도 2박 3일",
                LocalDate.now().plusDays(30), LocalDate.now().plusDays(32), null, null)).id();
    }

    @Test
    void 빈_여행은_기간만_있고_집계는_0이다() {
        long[] c = couple("rc1@fitto.com", "rc2@fitto.com");
        Long tripId = trip(c[0]);

        TripRecapResponse r = recapService.recap(c[0], tripId);
        assertThat(r.days()).isEqualTo(3);
        assertThat(r.nights()).isEqualTo(2);
        assertThat(r.status()).isEqualTo(TripRecapResponse.UPCOMING);
        assertThat(r.itineraryItemCount()).isZero();
        assertThat(r.placeCount()).isZero();
        assertThat(r.expenseTotal()).isEqualByComparingTo("0");
        assertThat(r.photoCount()).isZero();
        assertThat(r.checklistTotal()).isZero();
    }

    @Test
    void 쌓인_일정_장소_경비_사진_준비물이_회고에_집계된다() {
        long[] c = couple("rc3@fitto.com", "rc4@fitto.com");
        Long tripId = trip(c[0]);

        // 일정 2개
        tripService.addItem(c[0], tripId, new SaveTripItemRequest(1, null, "공항", null, null, null));
        tripService.addItem(c[0], tripId, new SaveTripItemRequest(1, null, "점심", null, null, null));

        // 장소 2곳(1곳 방문완료)
        PlaceResponse visited = placeService.save(c[0], new SavePlaceRequest(
                "성산일출봉", null, null, null, "관광", PlaceStatus.VISITED));
        PlaceResponse wish = placeService.save(c[0], new SavePlaceRequest(
                "흑돼지집", null, null, null, "식당", PlaceStatus.WISHLIST));
        tripService.attachPlace(c[0], tripId, visited.id());
        tripService.attachPlace(c[0], tripId, wish.id());

        // 경비 30000
        expenseService.add(c[0], tripId,
                new SaveTripExpenseRequest(new BigDecimal("30000"), null, null, "식비", 1, null));

        // 준비물 2개 중 1개 체크
        ChecklistItemResponse item = checklistService.add(c[0], tripId, new SaveChecklistItemRequest("여권"));
        checklistService.add(c[0], tripId, new SaveChecklistItemRequest("선크림"));
        checklistService.toggle(c[0], tripId, item.id());

        // 앨범 사진 1장
        Long postId = feedService.createPost(c[0], new CreatePostRequest("첫날", "https://img/1.jpg")).refId();
        albumService.attach(c[0], tripId, postId);

        TripRecapResponse r = recapService.recap(c[1], tripId); // 상대가 조회해도 동일
        assertThat(r.itineraryItemCount()).isEqualTo(2);
        assertThat(r.placeCount()).isEqualTo(2);
        assertThat(r.visitedPlaceCount()).isEqualTo(1);
        assertThat(r.expenseTotal()).isEqualByComparingTo("30000");
        assertThat(r.photoCount()).isEqualTo(1);
        assertThat(r.checklistTotal()).isEqualTo(2);
        assertThat(r.checklistChecked()).isEqualTo(1);
    }

    @Test
    void 다른_커플의_회고는_볼_수_없다() {
        long[] c1 = couple("rc5@fitto.com", "rc6@fitto.com");
        long[] c2 = couple("rc7@fitto.com", "rc8@fitto.com");
        Long tripId = trip(c1[0]);

        assertThatThrownBy(() -> recapService.recap(c2[0], tripId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
