package com.fitto.feed.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.feed.domain.FeedComment;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.dto.FeedCommentResponse;
import com.fitto.feed.repository.FeedCommentRepository;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * 일상 댓글(V124, P2) — 이모지 반응으로는 못 하는 짧은 말을 그 기록 옆에 남긴다.
 *
 * <ul>
 *   <li><b>일상 포스트에만</b> 단다. 같은 커플의 포스트만(남의 관계 포스트 id 를 넣어도 막힌다).</li>
 *   <li>쓰면 상대에게 푸시(앞 40자, 상대 활동 카테고리)와 FEED 이벤트 — 열린 카드의 댓글 수가 바로 바뀐다.
 *       커플은 둘뿐이라 "글쓴이에게"가 아니라 "나 말고 그 사람에게" 보낸다(내 글에 내가 답해도 상대가 받는다).</li>
 *   <li>고치기는 없다 — 지우고 다시 쓴다. 지우기는 쓴 사람만.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class FeedCommentService {

    /** 한 포스트에서 내려 주는 댓글 상한 — 두 사람의 대화라 넘칠 일은 드물지만 상한 없는 조회를 두지 않는다 */
    static final int MAX_COMMENTS = 200;
    private static final int PREVIEW = 40;

    private final FeedCommentRepository commentRepository;
    private final FeedPostRepository postRepository;
    private final RelationRepository relationRepository;
    private final FeedItemMapper mapper;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public FeedCommentService(FeedCommentRepository commentRepository, FeedPostRepository postRepository,
                              RelationRepository relationRepository, FeedItemMapper mapper,
                              NotificationService notificationService, CoupleEventPublisher coupleEventPublisher) {
        this.commentRepository = commentRepository;
        this.postRepository = postRepository;
        this.relationRepository = relationRepository;
        this.mapper = mapper;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    public List<FeedCommentResponse> list(Long userId, Long postId) {
        coupleOf(userId, postId);
        List<FeedComment> comments = commentRepository.findByPostIdOrderByCreatedAtAscIdAsc(
                postId, PageRequest.of(0, MAX_COMMENTS));
        Map<Long, String> names = mapper.userNames(comments.stream().map(FeedComment::getAuthorId).distinct().toList());
        return comments.stream().map(c -> toResponse(c, names, userId)).toList();
    }

    @Transactional
    public FeedCommentResponse add(Long userId, Long postId, String rawContent) {
        Relation couple = coupleOf(userId, postId);
        String content = rawContent == null ? "" : rawContent.strip();
        if (content.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "댓글을 써 주세요.");
        }
        FeedComment saved = commentRepository.save(
                FeedComment.builder().postId(postId).authorId(userId).content(content).build());

        String name = mapper.userName(userId);
        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            String preview = content.length() > PREVIEW ? content.substring(0, PREVIEW) + "…" : content;
            notificationService.notify(partnerId, NotificationCategory.PARTNER,
                    name + "님이 댓글을 남겼어요", preview, PushLinks.FEED);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.FEED);
        return toResponse(saved, Map.of(userId, name), userId);
    }

    @Transactional
    public void delete(Long userId, Long commentId) {
        FeedComment comment = commentRepository.findById(commentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "댓글을 찾을 수 없어요."));
        Relation couple = coupleOf(userId, comment.getPostId());
        if (!userId.equals(comment.getAuthorId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 쓴 댓글만 지울 수 있어요.");
        }
        commentRepository.delete(comment);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.FEED);
    }

    /** 이 포스트가 내 커플의 것인지 — 아니면 없는 것처럼 404(남의 관계 포스트 존재를 알려 주지 않는다) */
    private Relation coupleOf(Long userId, Long postId) {
        Relation couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
        FeedPost post = postRepository.findById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEED_POST_NOT_FOUND));
        if (!post.getCoupleId().equals(couple.getId())) {
            throw new BusinessException(ErrorCode.FEED_POST_NOT_FOUND);
        }
        return couple;
    }

    private static FeedCommentResponse toResponse(FeedComment c, Map<Long, String> names, Long viewerId) {
        return new FeedCommentResponse(c.getId(), c.getAuthorId(), names.getOrDefault(c.getAuthorId(), "커플"),
                viewerId.equals(c.getAuthorId()), c.getContent(), c.getCreatedAt());
    }
}
