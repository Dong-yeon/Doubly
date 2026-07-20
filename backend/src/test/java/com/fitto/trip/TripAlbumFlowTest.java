package com.fitto.trip;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.AlbumPostResponse;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripAlbumService;
import com.fitto.trip.service.TripService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 커플 여행 앨범 통합 플로우 (PLAN.md Trip Album) — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class TripAlbumFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    TripService tripService;
    @Autowired
    FeedService feedService;
    @Autowired
    TripAlbumService albumService;

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

    private Long photoPost(Long userId, String caption, String url) {
        return feedService.createPost(userId, new CreatePostRequest(caption, url)).refId();
    }

    @Test
    void 사진을_앨범에_담고_빼면_목록에_반영된다() {
        long[] c = couple("al1@fitto.com", "al2@fitto.com");
        Long tripId = trip(c[0]);
        Long p1 = photoPost(c[0], "첫날", "https://img/1.jpg");
        Long p2 = photoPost(c[1], "둘째날", "https://img/2.jpg"); // 상대가 올린 사진도 담기 가능

        albumService.attach(c[0], tripId, p1);
        albumService.attach(c[1], tripId, p2);
        assertThat(albumService.list(c[0], tripId)).hasSize(2);

        albumService.detach(c[0], tripId, p1);
        assertThat(albumService.list(c[1], tripId))
                .extracting(AlbumPostResponse::id).containsExactly(p2);
    }

    @Test
    void 후보는_사진있는_미담김_포스트만_나온다() {
        long[] c = couple("al3@fitto.com", "al4@fitto.com");
        Long tripId = trip(c[0]);
        Long photo = photoPost(c[0], "사진", "https://img/a.jpg");
        feedService.createPost(c[0], new CreatePostRequest("글만 있는 포스트", null)); // 사진 없음 → 후보 제외

        assertThat(albumService.candidates(c[0], tripId))
                .extracting(AlbumPostResponse::id).containsExactly(photo);

        albumService.attach(c[0], tripId, photo); // 담으면 후보에서 빠진다
        assertThat(albumService.candidates(c[0], tripId)).isEmpty();
    }

    @Test
    void 앨범에서_빼도_포스트는_후보로_다시_보인다() {
        long[] c = couple("al5@fitto.com", "al6@fitto.com");
        Long tripId = trip(c[0]);
        Long photo = photoPost(c[0], "사진", "https://img/b.jpg");
        albumService.attach(c[0], tripId, photo);
        albumService.detach(c[0], tripId, photo);

        assertThat(albumService.candidates(c[0], tripId))
                .extracting(AlbumPostResponse::id).containsExactly(photo);
    }

    @Test
    void 다른_커플의_앨범엔_담을_수_없다() {
        long[] c1 = couple("al7@fitto.com", "al8@fitto.com");
        long[] c2 = couple("al9@fitto.com", "al10@fitto.com");
        Long tripId = trip(c1[0]);
        Long photo = photoPost(c1[0], "사진", "https://img/c.jpg");

        assertThatThrownBy(() -> albumService.attach(c2[0], tripId, photo))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);
    }
}
