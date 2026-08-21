package com.fitto.feed.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedCursor;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedPhotoResponse;
import com.fitto.feed.dto.FeedPhotosResponse;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitWithPlace;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * 커플 일상 피드 — PLAN.md Couple Feed. 포스트 + 운동/식단/맛집 방문을
 * 원본 테이블에서 병합해 하나의 타임라인으로 만든다 (복제 테이블 없음).
 */
@Service
@Transactional(readOnly = true)
public class FeedService {

    private static final int MAX_LIMIT = 50;

    private final FeedPostRepository feedPostRepository;
    private final FeedReactionRepository feedReactionRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final FeedItemMapper mapper;

    public FeedService(FeedPostRepository feedPostRepository,
                       FeedReactionRepository feedReactionRepository,
                       RelationRepository relationRepository,
                       WorkoutRepository workoutRepository,
                       MealRepository mealRepository,
                       PlaceVisitRepository placeVisitRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       FeedItemMapper mapper) {
        this.feedPostRepository = feedPostRepository;
        this.feedReactionRepository = feedReactionRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.mapper = mapper;
    }

    /**
     * 통합 타임라인 — 포스트·운동·식단·방문 4개 소스를 합쳐 최신순으로 돌려준다.
     *
     * <p>커서는 소스별 (createdAt, id) 위치를 담는다({@link FeedCursor}).
     * 타임스탬프 하나만 쓰면 같은 시각의 아이템이 페이지 경계에서 누락되고,
     * 테이블마다 id 공간이 달라 전역 보조키를 쓸 수도 없다.
     *
     * <p>각 소스에서 {@code size + 1} 건을 읽어 "더 있는지"를 판단한다.
     * 정확히 size 건만 읽으면 남은 데이터가 있어도 hasMore 가 false 가 된다.
     */
    public FeedTimelineResponse timeline(Long userId, String cursor, int limit) {
        Relation couple = activeCouple(userId);
        int size = Math.min(Math.max(limit, 1), MAX_LIMIT);
        FeedCursor from = FeedCursor.decode(cursor);
        // 다음 페이지 존재 여부를 알려면 한 건 더 읽어야 한다
        Pageable page = PageRequest.of(0, size + 1);

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = mapper.userNames(userIds);

        List<FeedItemResponse> merged = new ArrayList<>();
        for (FeedPost p : feedPostRepository.findTimeline(couple.getId(),
                from.createdAtOf(FeedItemType.POST), from.idOf(FeedItemType.POST), page)) {
            merged.add(mapper.toItem(p, names, userId, null));
        }
        for (Workout w : workoutRepository.findRecentForFeed(userIds,
                from.createdAtOf(FeedItemType.WORKOUT), from.idOf(FeedItemType.WORKOUT), page)) {
            merged.add(mapper.toItem(w, names, userId));
        }
        for (Meal m : mealRepository.findRecentForFeed(userIds,
                from.createdAtOf(FeedItemType.MEAL), from.idOf(FeedItemType.MEAL), page)) {
            merged.add(mapper.toItem(m, names, userId));
        }
        for (VisitWithPlace v : placeVisitRepository.findRecentForFeed(couple.getId(),
                from.createdAtOf(FeedItemType.PLACE_VISIT), from.idOf(FeedItemType.PLACE_VISIT), page)) {
            merged.add(mapper.toItem(v, names, userId));
        }

        // 정렬도 (occurredAt, refId) 복합키 — 같은 시각이면 id 역순으로 안정 정렬한다
        merged.sort(Comparator.comparing(FeedItemResponse::occurredAt)
                .thenComparing(FeedItemResponse::refId)
                .reversed());

        boolean hasMore = merged.size() > size;
        List<FeedItemResponse> items = hasMore ? new ArrayList<>(merged.subList(0, size)) : merged;

        String nextCursor = items.isEmpty() ? null : nextCursorOf(from, items).encode();
        items = mapper.attachReactions(items, userId);
        return new FeedTimelineResponse(items, nextCursor, hasMore);
    }

    /**
     * 전체 사진첩 — 사진이 있는 커플 포스트만 모아본다.
     * 타임라인과 동일한 (createdAt, id) keyset 이지만 소스가 포스트 하나라 커서도 POST 위치만 담는다.
     */
    public FeedPhotosResponse photos(Long userId, String cursor, int limit) {
        Relation couple = activeCouple(userId);
        int size = Math.min(Math.max(limit, 1), MAX_LIMIT);
        FeedCursor from = FeedCursor.decode(cursor);
        Pageable page = PageRequest.of(0, size + 1);

        List<FeedPost> posts = feedPostRepository.findPhotos(couple.getId(),
                from.createdAtOf(FeedItemType.POST), from.idOf(FeedItemType.POST), page);
        boolean hasMore = posts.size() > size;
        if (hasMore) {
            posts = posts.subList(0, size);
        }

        Long partnerId = couple.partnerOf(userId);
        Map<Long, String> names = mapper.userNames(
                partnerId != null ? List.of(userId, partnerId) : List.of(userId));

        List<FeedPhotoResponse> items = posts.stream()
                .map(p -> new FeedPhotoResponse(
                        p.getId(),
                        p.getImageUrl(),
                        p.getContent(),
                        names.getOrDefault(p.getAuthorId(), "상대방"),
                        p.getAuthorId().equals(userId),
                        p.getTripId(),
                        p.getCreatedAt()))
                .toList();

        String nextCursor = null;
        if (!posts.isEmpty()) {
            FeedPost last = posts.get(posts.size() - 1);
            Map<FeedItemType, FeedCursor.Position> positions = new EnumMap<>(FeedItemType.class);
            positions.put(FeedItemType.POST, new FeedCursor.Position(last.getCreatedAt(), last.getId()));
            nextCursor = new FeedCursor(positions).encode();
        }
        return new FeedPhotosResponse(items, nextCursor, hasMore);
    }

    /**
     * 이번 페이지에서 각 소스를 어디까지 읽었는지로 다음 커서를 만든다.
     * 이번 페이지에 등장하지 않은 소스는 이전 위치를 그대로 유지한다
     * — 그래야 다음 페이지에서 그 소스의 후보가 다시 검토된다.
     */
    private FeedCursor nextCursorOf(FeedCursor previous, List<FeedItemResponse> items) {
        Map<FeedItemType, FeedCursor.Position> next = new EnumMap<>(previous.positions());
        for (FeedItemResponse item : items) {
            next.put(item.type(), new FeedCursor.Position(item.occurredAt(), item.refId()));
        }
        return new FeedCursor(next);
    }

    /** 포스트 작성 (FEED-02) — 글/사진 중 하나는 필수. 상대에게 푸시 + FEED 이벤트. */
    @Transactional
    public FeedItemResponse createPost(Long userId, CreatePostRequest request) {
        String content = request.content() != null ? request.content().trim() : null;
        String imageUrl = request.imageUrl() != null ? request.imageUrl().trim() : null;
        if ((content == null || content.isEmpty()) && (imageUrl == null || imageUrl.isEmpty())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "글이나 사진 중 하나는 남겨주세요.");
        }

        Relation couple = activeCouple(userId);
        FeedPost post = FeedPost.builder()
                .coupleId(couple.getId())
                .authorId(userId)
                .content(content)
                .imageUrl(imageUrl)
                .build();
        feedPostRepository.save(post);

        Long partnerId = couple.partnerOf(userId);
        String authorName = mapper.userName(userId);
        if (partnerId != null) {
            String preview = content != null && !content.isEmpty()
                    ? (content.length() > 40 ? content.substring(0, 40) + "…" : content)
                    : "사진을 남겼어요";
            notificationService.notify(partnerId, authorName + "님의 새 일상", preview,
                    Map.of("type", "feed", "id", String.valueOf(post.getId())));
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.FEED);

        return mapper.toItem(post, Map.of(userId, authorName), userId, List.of());
    }

    /** 포스트 삭제 — 작성자 본인만. */
    @Transactional
    public void deletePost(Long userId, Long postId) {
        FeedPost post = getCouplePost(userId, postId);
        if (!userId.equals(post.getAuthorId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 쓴 포스트만 삭제할 수 있습니다.");
        }
        feedPostRepository.delete(post);
        coupleEventPublisher.publish(post.getCoupleId(), CoupleEvent.FEED);
    }

    /** 이모지 반응 토글 (FEED-03) — 새로 달면 상대(작성자)에게 푸시. */
    @Transactional
    public List<ReactionSummary> toggleReaction(Long userId, Long postId, String emoji) {
        FeedPost post = getCouplePost(userId, postId);
        var existing = feedReactionRepository.findByPostIdAndUserIdAndEmoji(postId, userId, emoji);
        if (existing.isPresent()) {
            feedReactionRepository.delete(existing.get());
        } else {
            feedReactionRepository.save(FeedReaction.builder()
                    .postId(postId)
                    .userId(userId)
                    .emoji(emoji)
                    .build());
            if (!userId.equals(post.getAuthorId())) {
                notificationService.notify(post.getAuthorId(), "일상에 반응이 달렸어요",
                        mapper.userName(userId) + "님이 " + emoji + " 를 남겼어요",
                        Map.of("type", "feed", "id", String.valueOf(post.getId())));
            }
        }
        coupleEventPublisher.publish(post.getCoupleId(), CoupleEvent.FEED);
        return mapper.summarize(feedReactionRepository.findByPostId(postId), userId);
    }

    // ---- helpers ----

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private FeedPost getCouplePost(Long userId, Long postId) {
        FeedPost post = feedPostRepository.findById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEED_POST_NOT_FOUND));
        if (!post.getCoupleId().equals(activeCouple(userId).getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return post;
    }
}
