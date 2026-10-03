package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 일상 저장 멱등키(V127) — 응답을 못 받은 앱의 재시도가 글을 하나 더 만들지 않는다
 * (docs/first-experience-audit.md #24).
 *
 * <p>FeedFlowTest 와 따로 둔 이유: 그쪽은 @MockitoSpyBean 으로 컨텍스트가 하나 더 생긴다. 이 테스트는
 * 기본 컨텍스트를 그대로 쓴다(CLAUDE.md 6절 — 컨텍스트 가짓수가 늘면 CI 힙이 모자란다).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedPostIdempotencyTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired FeedPostRepository feedPostRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1")
                .user().id();
    }

    /** 커플을 맺고 작성자(초대한 쪽) id 를 돌려준다 */
    private Long coupledAuthor(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return a;
    }

    private long postCount(Long authorId) {
        return feedPostRepository.findAll().stream().filter(p -> p.getAuthorId().equals(authorId)).count();
    }

    @Test
    void 같은_키로_다시_저장하면_먼저_저장된_글을_돌려주고_새로_만들지_않는다() {
        Long author = coupledAuthor("feed-idem-a@fitto.com", "feed-idem-b@fitto.com");

        FeedItemResponse first = feedService.createPost(author,
                new CreatePostRequest("오늘 산책", null, null, null, "compose-1"));
        FeedItemResponse retry = feedService.createPost(author,
                new CreatePostRequest("오늘 산책", null, null, null, "compose-1"));

        assertThat(retry.refId()).isEqualTo(first.refId());
        assertThat(postCount(author)).isEqualTo(1);
    }

    @Test
    void 키가_다르거나_없으면_각각_새_글이다() {
        Long author = coupledAuthor("feed-idem-c@fitto.com", "feed-idem-d@fitto.com");

        feedService.createPost(author, new CreatePostRequest("하나", null, null, null, "compose-a"));
        feedService.createPost(author, new CreatePostRequest("둘", null, null, null, "compose-b"));
        feedService.createPost(author, new CreatePostRequest("셋", null));
        feedService.createPost(author, new CreatePostRequest("넷", null));

        assertThat(postCount(author)).isEqualTo(4);
    }
}
