package com.fitto.trip.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trip.domain.Trip;
import com.fitto.trip.dto.AlbumPostResponse;
import com.fitto.trip.repository.TripRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 커플 여행 앨범 — PLAN.md Trip Album. 일상 피드 포스트(feed_posts)를 여행 단위로 큐레이션한다.
 * 새 도메인 없이 feed_posts.trip_id 로 연결만 하며, 담기/빼기는 포스트를 피드에서 지우지 않는다.
 */
@Service
@Transactional(readOnly = true)
public class TripAlbumService {

    private static final int CANDIDATE_LIMIT = 60;

    private final TripRepository tripRepository;
    private final FeedPostRepository feedPostRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final CoupleEventPublisher coupleEventPublisher;

    public TripAlbumService(TripRepository tripRepository,
                            FeedPostRepository feedPostRepository,
                            RelationRepository relationRepository,
                            UserRepository userRepository,
                            CoupleEventPublisher coupleEventPublisher) {
        this.tripRepository = tripRepository;
        this.feedPostRepository = feedPostRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 앨범 사진 목록 — 여행에 담긴 포스트, 최신순. */
    public List<AlbumPostResponse> list(Long userId, Long tripId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        return toResponses(feedPostRepository.findByTripIdOrderByCreatedAtDescIdDesc(trip.getId()), userId);
    }

    /** 담기 후보 — 사진이 있고 이 여행에 없는 커플 포스트. */
    public List<AlbumPostResponse> candidates(Long userId, Long tripId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        Pageable page = PageRequest.of(0, CANDIDATE_LIMIT);
        return toResponses(feedPostRepository.findAlbumCandidates(couple.getId(), trip.getId(), page), userId);
    }

    /** 포스트를 앨범에 담기 — 다른 여행에 있던 포스트면 이 여행으로 옮긴다. */
    @Transactional
    public void attach(Long userId, Long tripId, Long postId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        FeedPost post = getCouplePost(couple, postId);
        post.assignTrip(trip.getId());
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
    }

    /** 앨범에서 빼기 — 연결만 해제, 포스트는 피드에 그대로 남는다. */
    @Transactional
    public void detach(Long userId, Long tripId, Long postId) {
        Relation couple = activeCouple(userId);
        Trip trip = getCoupleTrip(couple, tripId);
        FeedPost post = getCouplePost(couple, postId);
        if (!trip.getId().equals(post.getTripId())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이 여행 앨범의 사진이 아니에요.");
        }
        post.assignTrip(null);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.TRIP);
    }

    // ---- helpers ----

    private List<AlbumPostResponse> toResponses(List<FeedPost> posts, Long userId) {
        if (posts.isEmpty()) {
            return List.of();
        }
        Map<Long, String> names = new HashMap<>();
        return posts.stream()
                .map(p -> AlbumPostResponse.of(p,
                        names.computeIfAbsent(p.getAuthorId(), this::userName),
                        p.getAuthorId().equals(userId)))
                .toList();
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private Trip getCoupleTrip(Relation couple, Long tripId) {
        Trip trip = tripRepository.findById(tripId)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_NOT_FOUND));
        if (!trip.getCoupleId().equals(couple.getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return trip;
    }

    private FeedPost getCouplePost(Relation couple, Long postId) {
        FeedPost post = feedPostRepository.findById(postId)
                .orElseThrow(() -> new BusinessException(ErrorCode.FEED_POST_NOT_FOUND));
        if (!post.getCoupleId().equals(couple.getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return post;
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
