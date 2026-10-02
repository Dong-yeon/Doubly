package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.TestPro;
import com.fitto.common.time.KstClock;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedPhotoResponse;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 일상 포스트 기록일(V119) — 고르지 않으면 오늘, 미래는 거절, 사진첩·사진첩 달력·작년 오늘은 기록일로 묶는다.
 * FeedPhotosTest 와 같은 설정이라 스프링 컨텍스트를 새로 만들지 않는다(CLAUDE.md 6절 — 힙).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedRecordDateTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired MemoriesService memoriesService;
    @Autowired SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String a, String b) {
        Long ida = register(a);
        Long idb = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ida);
        relationService.connectCouple(idb, invite.code());
        return new long[]{ida, idb};
    }

    private FeedItemResponse photoPost(long userId, String url, LocalDate recordDate) {
        return feedService.createPost(userId, new CreatePostRequest("사진 " + url, null, List.of(url), recordDate));
    }

    @Test
    void 날짜를_고르지_않으면_오늘이_기록일이다() {
        long[] c = couple("rd-a@fitto.com", "rd-b@fitto.com");
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("오늘 일", null));
        assertThat(post.recordDate()).isEqualTo(KstClock.today());
    }

    @Test
    void 지난_날짜를_고르면_그_날이_기록일이고_타임라인에도_실린다() {
        long[] c = couple("rd-c@fitto.com", "rd-d@fitto.com");
        LocalDate yesterday = KstClock.today().minusDays(1);
        FeedItemResponse post = feedService.createPost(c[0], new CreatePostRequest("어제 일", null, null, yesterday));
        assertThat(post.recordDate()).isEqualTo(yesterday);

        FeedItemResponse inTimeline = feedService.timeline(c[1], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.POST && i.refId().equals(post.refId()))
                .findFirst().orElseThrow();
        assertThat(inTimeline.recordDate()).isEqualTo(yesterday);
    }

    @Test
    void 미래_날짜와_터무니없이_오래된_날짜는_거절한다() {
        long[] c = couple("rd-e@fitto.com", "rd-f@fitto.com");
        assertThatThrownBy(() -> feedService.createPost(c[0],
                new CreatePostRequest("내일 일", null, null, KstClock.today().plusDays(1))))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
        assertThatThrownBy(() -> feedService.createPost(c[0],
                new CreatePostRequest("옛날 일", null, null, LocalDate.of(1999, 12, 31))))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 늦게_올린_지난_날짜_사진은_사진첩에서_그_날짜_자리에_선다() {
        long[] c = couple("rd-g@fitto.com", "rd-h@fitto.com");
        LocalDate today = KstClock.today();
        FeedItemResponse todays = photoPost(c[0], "https://img.example.com/today.jpg", today);
        // 나중에 올렸지만 닷새 전 일 — 업로드 순서가 아니라 기록일 순서여야 한다
        FeedItemResponse older = photoPost(c[0], "https://img.example.com/older.jpg", today.minusDays(5));

        List<FeedPhotoResponse> items = feedService.photos(c[0], null, 20, List.of(FeedItemType.POST)).items();
        assertThat(items).extracting(FeedPhotoResponse::refId).containsExactly(todays.refId(), older.refId());
        assertThat(items.get(1).recordDate()).isEqualTo(today.minusDays(5));
    }

    @Test
    void 사진첩_커서는_기록일을_따라_이어진다() {
        long[] c = couple("rd-i@fitto.com", "rd-j@fitto.com");
        LocalDate today = KstClock.today();
        // 올린 순서와 기록일 순서를 엇갈리게 섞는다
        Long d3 = photoPost(c[0], "https://img.example.com/d3.jpg", today.minusDays(3)).refId();
        Long d0 = photoPost(c[0], "https://img.example.com/d0.jpg", today).refId();
        Long d1 = photoPost(c[0], "https://img.example.com/d1.jpg", today.minusDays(1)).refId();
        Long d2 = photoPost(c[0], "https://img.example.com/d2.jpg", today.minusDays(2)).refId();

        var first = feedService.photos(c[0], null, 2, List.of(FeedItemType.POST));
        var second = feedService.photos(c[0], first.nextCursor(), 2, List.of(FeedItemType.POST));
        assertThat(first.items()).extracting(FeedPhotoResponse::refId).containsExactly(d0, d1);
        assertThat(second.items()).extracting(FeedPhotoResponse::refId).containsExactly(d2, d3);
    }

    @Test
    void 사진첩_달력은_기록일의_달로_묶는다() {
        long[] c = couple("rd-k@fitto.com", "rd-l@fitto.com");
        LocalDate lastMonth = KstClock.today().minusMonths(1).withDayOfMonth(10);
        FeedItemResponse post = photoPost(c[0], "https://img.example.com/lm.jpg", lastMonth);

        assertThat(feedService.photoMonth(c[0], YearMonth.from(lastMonth).toString(), List.of(FeedItemType.POST), null)
                .items()).extracting(FeedPhotoResponse::refId).contains(post.refId());
        assertThat(feedService.photoMonth(c[0], YearMonth.from(KstClock.today()).toString(), List.of(FeedItemType.POST), null)
                .items()).extracting(FeedPhotoResponse::refId).doesNotContain(post.refId());
    }

    @Test
    void 작년_오늘_날짜로_남긴_포스트는_오늘_올렸어도_작년_오늘의_추억이다() {
        long[] c = couple("rd-m@fitto.com", "rd-n@fitto.com");
        TestPro.grant(subscriptionRepository, c[0], c[1]); // 추억은 PRO 기능
        LocalDate today = KstClock.today();
        FeedItemResponse post = feedService.createPost(c[0],
                new CreatePostRequest("작년 이날", null, null, today.minusYears(1)));

        MemoriesResponse memories = memoriesService.memories(c[1], today);
        assertThat(memories.groups()).isNotEmpty();
        assertThat(memories.groups().get(0).yearsAgo()).isEqualTo(1);
        assertThat(memories.groups().get(0).items()).extracting(FeedItemResponse::refId).contains(post.refId());
    }
}
