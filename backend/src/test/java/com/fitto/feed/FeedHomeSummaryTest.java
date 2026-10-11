package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.time.KstClock;
import com.fitto.content.domain.ContentType;
import com.fitto.content.dto.RecordContentLogRequest;
import com.fitto.content.dto.SaveContentRequest;
import com.fitto.content.service.ContentService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 홈 "최근 기록 한 줄" — 한 줄 요약(summary)과 소스 제외(exclude).
 *
 * <p>스프링 설정을 따로 바꾸지 않는다(목·프로퍼티 없음) — 다른 평범한 통합 테스트와 컨텍스트를 같이 쓴다
 * (CLAUDE.md 6절: 컨텍스트 가짓수가 늘면 CI 힙이 모자란다).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedHomeSummaryTest {

    private static final Set<FeedItemType> HOME_EXCLUDE = EnumSet.of(FeedItemType.PLACE_VISIT, FeedItemType.CONTENT_LOG);

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    FeedService feedService;
    @Autowired
    MealService mealService;
    @Autowired
    PlaceService placeService;
    @Autowired
    ContentService contentService;
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

    private Long meal(Long userId, String memo) {
        return mealService.save(userId, new SaveMealRequest(KstClock.today(), MealType.LUNCH, memo, null, 600,
                null, null, null, null, null, null, null)).id();
    }

    private FeedItemResponse only(List<FeedItemResponse> items, FeedItemType type) {
        return items.stream().filter(i -> i.type() == type).findFirst().orElseThrow();
    }

    @Test
    void 장소_방문의_한_줄은_이름과_숫자_별점이다_메모가_없어도_별만_남지_않는다() {
        long[] c = couple("fhs1a@fitto.com", "fhs1b@fitto.com");
        Long placeId = placeService.save(c[0], new SavePlaceRequest("트라토리아", "연남동", null, null, "음식점")).id();
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), 4, null, null, null));

        FeedItemResponse visit = only(feedService.timeline(c[0], null, 20).items(), FeedItemType.PLACE_VISIT);

        assertThat(visit.summary()).isEqualTo("트라토리아 ★4");
        // 피드 카드 본문은 그대로다 — 카드는 별 문자열과 메모를 그린다
        assertThat(visit.content()).isEqualTo("★★★★");
        assertThat(visit.title()).isEqualTo("트라토리아 방문");
    }

    @Test
    void 메모가_있어도_한_줄은_이름과_별점이고_별점이_없으면_이름만() {
        long[] c = couple("fhs2a@fitto.com", "fhs2b@fitto.com");
        Long placeId = placeService.save(c[0], new SavePlaceRequest("성수 브런치", "성수동", null, null, "카페·디저트")).id();
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), 5, "웨이팅 30분", null, null));
        placeService.recordVisit(c[1], placeId, new RecordVisitRequest(KstClock.today(), null, "또 오자", null, null));

        List<FeedItemResponse> visits = feedService.timeline(c[0], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.PLACE_VISIT).toList();

        assertThat(visits).extracting(FeedItemResponse::summary)
                .containsExactlyInAnyOrder("성수 브런치 ★5", "성수 브런치");
    }

    @Test
    void 콘텐츠_관람의_한_줄도_제목과_숫자_별점이다() {
        long[] c = couple("fhs3a@fitto.com", "fhs3b@fitto.com");
        Long contentId = contentService.save(c[0], new SaveContentRequest("인셉션", ContentType.MOVIE, null)).id();
        contentService.recordLog(c[0], contentId, new RecordContentLogRequest(KstClock.today(), 3, null, null));

        FeedItemResponse log = only(feedService.timeline(c[0], null, 20).items(), FeedItemType.CONTENT_LOG);

        assertThat(log.summary()).isEqualTo("인셉션 ★3");
        assertThat(log.content()).isEqualTo("★★★");
    }

    @Test
    void 식단의_한_줄은_예전처럼_본문_없으면_제목이다() {
        long[] c = couple("fhs4a@fitto.com", "fhs4b@fitto.com");
        meal(c[0], "김밥");

        FeedItemResponse m = only(feedService.timeline(c[0], null, 20).items(), FeedItemType.MEAL);

        assertThat(m.summary()).isEqualTo(m.content() != null && !m.content().isBlank() ? m.content() : m.title());
    }

    @Test
    void 장소_방문이_한도를_채운_날에도_제외하면_식단이_실린다() {
        long[] c = couple("fhs5a@fitto.com", "fhs5b@fitto.com");
        Long mealId = meal(c[0], "점심 김밥");
        // 식단을 한 시간 앞으로 민다 — 같은 밀리초에 찍히면 병합 정렬이 (시각, refId) 로 가르는데 refId 는
        // 테이블마다 따로 매긴 id 라 식단이 방문들 사이로 끼어든다(전체 suite 에서 11+1 로 깨진 적 있다)
        jdbc.update("update meals set created_at = ? where id = ?", LocalDateTime.now().minusHours(1), mealId);
        Long placeId = placeService.save(c[0], new SavePlaceRequest("단골집", "어딘가", null, null, "음식점")).id();
        // 식단보다 나중에 방문 12건 — 홈이 받는 12건이 전부 방문으로 찬다
        for (int i = 0; i < 12; i++) {
            placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), 4, null, null, null));
        }

        List<FeedItemResponse> all = feedService.timeline(c[0], null, 12).items();
        List<FeedItemResponse> home = feedService.timeline(c[0], null, 12, HOME_EXCLUDE).items();

        // 받아서 거르는 방식이었다면 비어 버린다 — 서버에서 소스를 빼야 하는 이유
        assertThat(all).extracting(FeedItemResponse::type).containsOnly(FeedItemType.PLACE_VISIT);
        assertThat(home).extracting(FeedItemResponse::type).containsExactly(FeedItemType.MEAL);
    }

    @Test
    void 제외_목록이_비면_전부다_예전_앱과_같다() {
        long[] c = couple("fhs6a@fitto.com", "fhs6b@fitto.com");
        meal(c[0], "저녁");
        Long placeId = placeService.save(c[0], new SavePlaceRequest("단골집2", "어딘가", null, null, "음식점")).id();
        placeService.recordVisit(c[0], placeId, new RecordVisitRequest(KstClock.today(), 4, null, null, null));

        assertThat(feedService.timeline(c[0], null, 20, Set.of()).items()).extracting(FeedItemResponse::type)
                .contains(FeedItemType.MEAL, FeedItemType.PLACE_VISIT);
        assertThat(feedService.timeline(c[0], null, 20).items()).hasSize(2);
    }
}
