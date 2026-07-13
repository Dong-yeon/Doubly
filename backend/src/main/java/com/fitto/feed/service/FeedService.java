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
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
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
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
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
    private final UserRepository userRepository;
    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public FeedService(FeedPostRepository feedPostRepository,
                       FeedReactionRepository feedReactionRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       WorkoutRepository workoutRepository,
                       MealRepository mealRepository,
                       PlaceVisitRepository placeVisitRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher) {
        this.feedPostRepository = feedPostRepository;
        this.feedReactionRepository = feedReactionRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 통합 타임라인 (FEED-01) — 소스별 상위 N건을 모아 병합 정렬 후 limit 로 자른다. */
    public FeedTimelineResponse timeline(Long userId, LocalDateTime cursor, int limit) {
        Relation couple = activeCouple(userId);
        int size = Math.min(Math.max(limit, 1), MAX_LIMIT);
        LocalDateTime before = cursor != null ? cursor : LocalDateTime.now().plusDays(1);
        Pageable page = PageRequest.of(0, size);

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = userNames(userIds);

        List<FeedItemResponse> merged = new ArrayList<>();
        for (FeedPost p : feedPostRepository.findTimeline(couple.getId(), before, page)) {
            merged.add(toItem(p, names, userId, null));
        }
        for (Workout w : workoutRepository.findRecentForFeed(userIds, before, page)) {
            merged.add(toItem(w, names, userId));
        }
        for (Meal m : mealRepository.findRecentForFeed(userIds, before, page)) {
            merged.add(toItem(m, names, userId));
        }
        for (VisitWithPlace v : placeVisitRepository.findRecentForFeed(couple.getId(), before, page)) {
            merged.add(toItem(v, names, userId));
        }

        merged.sort(Comparator.comparing(FeedItemResponse::occurredAt).reversed());
        List<FeedItemResponse> items = merged.size() > size ? merged.subList(0, size) : merged;
        items = attachReactions(items, userId);

        LocalDateTime nextCursor = items.isEmpty() ? null : items.get(items.size() - 1).occurredAt();
        return new FeedTimelineResponse(items, nextCursor, merged.size() > size);
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
        String authorName = userName(userId);
        if (partnerId != null) {
            String preview = content != null && !content.isEmpty()
                    ? (content.length() > 40 ? content.substring(0, 40) + "…" : content)
                    : "사진을 남겼어요";
            notificationService.notify(partnerId, authorName + "님의 새 일상 📸", preview);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.FEED);

        return toItem(post, Map.of(userId, authorName), userId, List.of());
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
                        userName(userId) + "님이 " + emoji + " 를 남겼어요");
            }
        }
        coupleEventPublisher.publish(post.getCoupleId(), CoupleEvent.FEED);
        return summarize(feedReactionRepository.findByPostId(postId), userId);
    }

    // ---- 아이템 변환 ----

    private FeedItemResponse toItem(FeedPost p, Map<Long, String> names, Long viewerId,
                                    List<ReactionSummary> reactions) {
        return new FeedItemResponse(FeedItemType.POST, p.getId(), p.getAuthorId(),
                names.getOrDefault(p.getAuthorId(), "커플"), viewerId.equals(p.getAuthorId()),
                null, p.getContent(), p.getImageUrl(), p.getCreatedAt(), reactions);
    }

    private FeedItemResponse toItem(Workout w, Map<Long, String> names, Long viewerId) {
        StringBuilder summary = new StringBuilder();
        if (!w.getSets().isEmpty()) {
            summary.append(w.getSets().get(0).getExerciseName());
            if (w.getSets().size() > 1) {
                summary.append(" 외 ").append(w.getSets().size() - 1).append("개");
            }
        }
        if (w.getTotalDurationMin() != null) {
            if (summary.length() > 0) summary.append(" · ");
            summary.append(w.getTotalDurationMin()).append("분");
        }
        return new FeedItemResponse(FeedItemType.WORKOUT, w.getId(), w.getUserId(),
                names.getOrDefault(w.getUserId(), "커플"), viewerId.equals(w.getUserId()),
                "운동 완료 💪", summary.length() > 0 ? summary.toString() : null,
                null, w.getCreatedAt(), null);
    }

    private FeedItemResponse toItem(Meal m, Map<Long, String> names, Long viewerId) {
        String calories = m.getCalories() != null ? m.getCalories() + "kcal" : null;
        String content = m.getMemo() != null && !m.getMemo().isBlank()
                ? (calories != null ? m.getMemo() + " · " + calories : m.getMemo())
                : calories;
        return new FeedItemResponse(FeedItemType.MEAL, m.getId(), m.getUserId(),
                names.getOrDefault(m.getUserId(), "커플"), viewerId.equals(m.getUserId()),
                m.getMealType().label() + " 식단 🍽️", content, m.getPhotoUrl(),
                m.getCreatedAt(), null);
    }

    private FeedItemResponse toItem(VisitWithPlace vp, Map<Long, String> names, Long viewerId) {
        var v = vp.getVisit();
        String stars = v.getRating() != null ? "★".repeat(v.getRating()) : null;
        String content = v.getMemo() != null && !v.getMemo().isBlank()
                ? (stars != null ? stars + " " + v.getMemo() : v.getMemo())
                : stars;
        return new FeedItemResponse(FeedItemType.PLACE_VISIT, v.getId(), v.getVisitedBy(),
                names.getOrDefault(v.getVisitedBy(), "커플"), viewerId.equals(v.getVisitedBy()),
                vp.getPlaceName() + " 방문 📍", content, v.getImageUrl(),
                v.getCreatedAt(), null);
    }

    /** POST 아이템에만 반응 요약을 채워 넣는다 (일괄 조회). */
    private List<FeedItemResponse> attachReactions(List<FeedItemResponse> items, Long viewerId) {
        List<Long> postIds = items.stream()
                .filter(i -> i.type() == FeedItemType.POST)
                .map(FeedItemResponse::refId)
                .toList();
        if (postIds.isEmpty()) {
            return items;
        }
        Map<Long, List<FeedReaction>> byPost = new LinkedHashMap<>();
        for (FeedReaction r : feedReactionRepository.findByPostIdIn(postIds)) {
            byPost.computeIfAbsent(r.getPostId(), k -> new ArrayList<>()).add(r);
        }
        return items.stream()
                .map(i -> i.type() == FeedItemType.POST
                        ? new FeedItemResponse(i.type(), i.refId(), i.userId(), i.userName(), i.mine(),
                        i.title(), i.content(), i.imageUrl(), i.occurredAt(),
                        summarize(byPost.getOrDefault(i.refId(), List.of()), viewerId))
                        : i)
                .toList();
    }

    private List<ReactionSummary> summarize(List<FeedReaction> reactions, Long viewerId) {
        Map<String, List<FeedReaction>> byEmoji = new LinkedHashMap<>();
        for (FeedReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new ArrayList<>()).add(r);
        }
        return byEmoji.entrySet().stream()
                .map(e -> new ReactionSummary(e.getKey(), e.getValue().size(),
                        e.getValue().stream().anyMatch(r -> viewerId.equals(r.getUserId()))))
                .toList();
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

    private Map<Long, String> userNames(List<Long> userIds) {
        Map<Long, String> names = new LinkedHashMap<>();
        for (User u : userRepository.findAllById(userIds)) {
            names.put(u.getId(), u.getName());
        }
        return names;
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
