package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.auth.service.UserDataPurger;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedCommentResponse;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.repository.FeedCommentRepository;
import com.fitto.feed.service.FeedCommentService;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.service.RelationRecordPurger;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 일상 댓글(V124). FeedPhotosTest 와 같은 설정이라 스프링 컨텍스트를 새로 만들지 않는다(CLAUDE.md 6절 — 힙).
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedCommentFlowTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired FeedCommentService commentService;
    @Autowired FeedCommentRepository commentRepository;
    @Autowired RelationRecordPurger relationRecordPurger;
    @Autowired UserDataPurger userDataPurger;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String tag) {
        Long a = register("cmt-" + tag + "-a@fitto.com");
        Long b = register("cmt-" + tag + "-b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        return new long[]{a, b};
    }

    private FeedItemResponse cardOf(long viewer, Long postId) {
        return feedService.timeline(viewer, null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.POST && i.refId().equals(postId))
                .findFirst().orElseThrow();
    }

    @Test
    void 댓글을_쓰면_둘_다_보고_카드의_댓글_수가_오른다() {
        long[] c = couple("t1");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("바다 다녀옴", null)).refId();
        assertThat(cardOf(c[1], postId).commentCount()).isZero();

        FeedCommentResponse fromB = commentService.add(c[1], postId, "  어디 바다야?  ");
        commentService.add(c[0], postId, "강릉!");

        assertThat(fromB.content()).isEqualTo("어디 바다야?");
        List<FeedCommentResponse> seenByA = commentService.list(c[0], postId);
        assertThat(seenByA).extracting(FeedCommentResponse::content).containsExactly("어디 바다야?", "강릉!");
        assertThat(seenByA).extracting(FeedCommentResponse::mine).containsExactly(false, true);
        assertThat(cardOf(c[1], postId).commentCount()).isEqualTo(2);
    }

    @Test
    void 지우기는_쓴_사람만_하고_지우면_수가_준다() {
        long[] c = couple("t2");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("글", null)).refId();
        Long commentId = commentService.add(c[1], postId, "댓글").id();

        assertThatThrownBy(() -> commentService.delete(c[0], commentId))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FORBIDDEN);

        commentService.delete(c[1], commentId);
        assertThat(cardOf(c[0], postId).commentCount()).isZero();
    }

    @Test
    void 다른_커플의_포스트에는_쓸_수도_볼_수도_없다() {
        long[] mine = couple("t3");
        long[] other = couple("t3o");
        Long otherPost = feedService.createPost(other[0], new CreatePostRequest("남의 글", null)).refId();

        assertThatThrownBy(() -> commentService.add(mine[0], otherPost, "몰래"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FEED_POST_NOT_FOUND);
        assertThatThrownBy(() -> commentService.list(mine[0], otherPost))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.FEED_POST_NOT_FOUND);
    }

    @Test
    void 공백만_있는_댓글은_거절한다() {
        long[] c = couple("t4");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("글", null)).refId();
        assertThatThrownBy(() -> commentService.add(c[1], postId, "   "))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 포스트를_지우면_댓글도_함께_사라진다() {
        long[] c = couple("t5");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("지울 글", null)).refId();
        Long commentId = commentService.add(c[1], postId, "남을까?").id();

        feedService.deletePost(c[0], postId);

        assertThat(commentRepository.findById(commentId)).isEmpty();
    }

    @Test
    void 지난_기록_삭제는_그_관계의_댓글을_거둔다() {
        long[] c = couple("t6");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("추억", null)).refId();
        Long commentId = commentService.add(c[1], postId, "그립다").id();
        Long relationId = relationService.findMyRelations(c[0]).get(0).id();

        relationService.endRelation(c[1], relationId);
        relationRecordPurger.purge(relationId);

        assertThat(commentRepository.findById(commentId)).isEmpty();
    }

    @Test
    @Transactional
    void 댓글을_쓴_사람이_탈퇴해도_FK_위반_없이_지워진다() {
        long[] c = couple("t7");
        Long postId = feedService.createPost(c[0], new CreatePostRequest("글", null)).refId();
        Long commentId = commentService.add(c[1], postId, "탈퇴할 사람의 댓글").id();

        userDataPurger.purgeFor(c[1]);

        assertThat(commentRepository.findById(commentId)).isEmpty();
    }
}
