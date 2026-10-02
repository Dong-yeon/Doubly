package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.time.KstClock;
import com.fitto.content.domain.ContentType;
import com.fitto.content.dto.RecordContentLogRequest;
import com.fitto.content.dto.SaveContentRequest;
import com.fitto.content.service.ContentService;
import com.fitto.place.domain.Place;
import com.fitto.place.dto.LovelichelinPulseResponse;
import com.fitto.place.dto.LovelichelinPulseResponse.Kind;
import com.fitto.place.dto.LovelichelinPulseResponse.Signal;
import com.fitto.place.dto.LovelichelinPulseResponse.State;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.service.LovelichelinPulseService;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 홈 이름 옆 럽슐랭 왕관 신호. 설정을 바꾸지 않는 평범한 통합 테스트라 다른 테스트와 컨텍스트를 같이 쓴다.
 *
 * <p>테스트 JVM 은 KST 고정이라 저장 TZ 도 KST 다(운영은 UTC). 그래도 "KST 하루 경계"와 "24시간"을 각각 시각을
 * 직접 옮겨 확인한다 — 경계 계산이 저장 TZ 를 거치는 길은 같다.
 */
@SpringBootTest
@ActiveProfiles("test")
class LovelichelinPulseTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    PlaceService placeService;
    @Autowired
    ContentService contentService;
    @Autowired
    LovelichelinPulseService pulseService;
    @Autowired
    PlaceRepository placeRepository;
    @Autowired
    JdbcTemplate jdbc;

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

    private Long place(Long userId, String name) {
        return placeService.save(userId, new SavePlaceRequest(name, "어딘가", null, null, "음식점")).id();
    }

    @Test
    void 아무것도_안_했으면_둘_다_표시_없음() {
        long[] c = couple("lp1a@fitto.com", "lp1b@fitto.com");
        place(c[0], "담아만 둔 곳"); // 담기만 한 건 기록이 아니다

        LovelichelinPulseResponse r = pulseService.pulse(c[0]);

        assertThat(r.me()).isNull();
        assertThat(r.partner()).isNull();
    }

    @Test
    void 오늘_방문_기록을_남기면_그_사람에게만_정지_왕관() {
        long[] c = couple("lp2a@fitto.com", "lp2b@fitto.com");
        Long placeId = place(c[0], "연남 파스타");
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), null, "맛있었다", null, null));

        LovelichelinPulseResponse mine = pulseService.pulse(c[0]);
        assertThat(mine.me()).extracting(Signal::state, Signal::kind, Signal::targetId, Signal::targetName)
                .containsExactly(State.TODAY, Kind.PLACE, placeId, "연남 파스타");
        assertThat(mine.me().certificationKey()).isNull();
        assertThat(mine.partner()).isNull();

        // 상대가 보는 홈 — 내 왕관이 '상대' 쪽에 뜨고, 상대는 아직 그 곳에 평점이 없다(평가 영역을 열어 들어간다)
        LovelichelinPulseResponse theirs = pulseService.pulse(c[1]);
        assertThat(theirs.me()).isNull();
        assertThat(theirs.partner().targetId()).isEqualTo(placeId);
        assertThat(theirs.partner().viewerRated()).isFalse();
    }

    @Test
    void 대표_평점만_매겨도_오늘_기록이다() {
        long[] c = couple("lp3a@fitto.com", "lp3b@fitto.com");
        Long placeId = place(c[1], "성수 카페");
        placeService.rate(c[1], placeId, new RatePlaceRequest(4, null));

        LovelichelinPulseResponse r = pulseService.pulse(c[0]);

        assertThat(r.partner()).extracting(Signal::state, Signal::targetId).containsExactly(State.TODAY, placeId);
        assertThat(r.me()).isNull();
    }

    @Test
    void 콘텐츠_관람_기록도_오늘_기록이다() {
        long[] c = couple("lp4a@fitto.com", "lp4b@fitto.com");
        Long contentId = contentService.save(c[0], new SaveContentRequest("인셉션", ContentType.MOVIE, null)).id();
        contentService.recordLog(c[0], contentId, new RecordContentLogRequest(KstClock.today(), 5, null, null));

        Signal me = pulseService.pulse(c[0]).me();

        assertThat(me).extracting(Signal::state, Signal::kind, Signal::targetId, Signal::targetName)
                .containsExactly(State.TODAY, Kind.CONTENT, contentId, "인셉션");
    }

    @Test
    void 둘_다_평가해_등극하면_두_사람_모두_등극_왕관이고_열쇠가_같다() {
        long[] c = couple("lp5a@fitto.com", "lp5b@fitto.com");
        Long placeId = place(c[0], "단골집");
        placeService.rate(c[0], placeId, new RatePlaceRequest(5, null));
        placeService.rate(c[1], placeId, new RatePlaceRequest(5, null));

        LovelichelinPulseResponse r = pulseService.pulse(c[0]);

        assertThat(r.me()).extracting(Signal::state, Signal::targetId, Signal::tier)
                .containsExactly(State.CERTIFIED, placeId, 3);
        assertThat(r.partner().state()).isEqualTo(State.CERTIFIED);
        assertThat(r.me().certificationKey()).isNotBlank().isEqualTo(r.partner().certificationKey());
        assertThat(r.partner().viewerRated()).isTrue();
    }

    @Test
    void 등극이_24시간을_넘으면_오늘_기록_규칙으로_돌아간다() {
        long[] c = couple("lp6a@fitto.com", "lp6b@fitto.com");
        Long placeId = place(c[0], "옛 단골");
        placeService.rate(c[0], placeId, new RatePlaceRequest(4, null));
        placeService.rate(c[1], placeId, new RatePlaceRequest(4, null));
        Place p = placeRepository.findById(placeId).orElseThrow();
        p.applyLovelichelinTier(p.getLovelichelinTier(), LocalDateTime.now(ZoneId.systemDefault()).minusHours(25));
        placeRepository.save(p);

        Signal me = pulseService.pulse(c[0]).me();

        // 평점은 오늘 매겼으므로 정지 왕관은 남는다
        assertThat(me.state()).isEqualTo(State.TODAY);
        assertThat(me.certificationKey()).isNull();
    }

    @Test
    void 어제_KST_기록은_오늘이_아니다_자정_경계() {
        long[] c = couple("lp7a@fitto.com", "lp7b@fitto.com");
        Long placeId = place(c[0], "어제 간 곳");
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), null, null, null, null));
        LocalDateTime kstMidnight = KstClock.today().atStartOfDay(KstClock.ZONE)
                .withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();

        jdbc.update("update place_visits set created_at = ? where place_id = ?",
                Timestamp.valueOf(kstMidnight.minusMinutes(1)), placeId);
        assertThat(pulseService.pulse(c[0]).me()).isNull();

        jdbc.update("update place_visits set created_at = ? where place_id = ?",
                Timestamp.valueOf(kstMidnight), placeId);
        assertThat(pulseService.pulse(c[0]).me()).isNotNull();
    }

    @Test
    void 커플이_아니면_빈_신호() {
        Long solo = register("lp8solo@fitto.com");

        LovelichelinPulseResponse r = pulseService.pulse(solo);

        assertThat(r.me()).isNull();
        assertThat(r.partner()).isNull();
    }
}
