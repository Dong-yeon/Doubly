package com.fitto.content.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.content.domain.Content;
import com.fitto.content.domain.ContentLog;
import com.fitto.content.domain.ContentRating;
import com.fitto.content.dto.ContentLogResponse;
import com.fitto.content.dto.ContentResponse;
import com.fitto.content.dto.ContentSearchResponse;
import com.fitto.content.dto.RateContentRequest;
import com.fitto.content.dto.RecordContentLogRequest;
import com.fitto.content.dto.SaveContentRequest;
import com.fitto.content.dto.UpdateContentRequest;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.repository.ContentLogRepository.LogSummary;
import com.fitto.content.repository.ContentRatingRepository;
import com.fitto.content.repository.ContentRepository;
import com.fitto.content.service.TmdbClient.TmdbResult;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 커플 콘텐츠(영화·공연·드라마) — {@link com.fitto.place.service.PlaceService} 와 같은
 * 등급 산정 규칙을 쓰는 별개 도메인. 왜 나뉘었는지는 {@link Content} 클래스 주석 참고.
 */
@Service
@Transactional(readOnly = true)
public class ContentService {

    private final ContentRepository contentRepository;
    private final ContentLogRepository contentLogRepository;
    private final ContentRatingRepository contentRatingRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final PlanGuard planGuard;
    private final FeedReactionRepository feedReactionRepository;
    private final TmdbClient tmdbClient;

    public ContentService(ContentRepository contentRepository,
                          ContentLogRepository contentLogRepository,
                          ContentRatingRepository contentRatingRepository,
                          RelationRepository relationRepository,
                          UserRepository userRepository,
                          NotificationService notificationService,
                          PlanGuard planGuard,
                          FeedReactionRepository feedReactionRepository,
                          TmdbClient tmdbClient) {
        this.contentRepository = contentRepository;
        this.contentLogRepository = contentLogRepository;
        this.contentRatingRepository = contentRatingRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.planGuard = planGuard;
        this.feedReactionRepository = feedReactionRepository;
        this.tmdbClient = tmdbClient;
    }

    /**
     * 제목 검색 — TMDB 를 그대로 위임한다(PLACE-01 의 "이름부터 찾기"와 같은 패턴,
     * PlaceService#search 참고). 저장 개수 상한은 {@link Feature#CONTENT_ITEM} 저장 시점에
     * 걸리므로 조회인 이 메서드는 게이팅하지 않는다.
     */
    public ContentSearchResponse search(String query, int size) {
        if (!tmdbClient.isConfigured() || query == null || query.isBlank()) {
            return ContentSearchResponse.unavailable();
        }
        List<TmdbResult> found = tmdbClient.search(query, Math.clamp(size, 1, 10));
        List<ContentSearchResponse.ContentSearchResult> results = found.stream()
                .map(r -> new ContentSearchResponse.ContentSearchResult(r.title(), r.type(), r.posterUrl(), r.year()))
                .toList();
        return new ContentSearchResponse(true, results);
    }

    /** 콘텐츠 등록 */
    @Transactional
    public ContentResponse save(Long userId, SaveContentRequest request) {
        Relation couple = activeCouple(userId);
        planGuard.requireCapacity(userId, Feature.CONTENT_ITEM,
                contentRepository.countByCoupleId(couple.getId()));
        Content content = Content.builder()
                .coupleId(couple.getId())
                .title(request.title().trim())
                .type(request.type())
                .addedBy(userId)
                .posterUrl(request.posterUrl())
                .build();
        contentRepository.save(content);
        return toResponse(content, null, RatingPair.EMPTY, null);
    }

    /** 커플 공유 콘텐츠 목록 — 관람 요약 + 럽슐랭 평가 + 매거진 카드용 커버 포함 */
    public List<ContentResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        List<Content> contents = contentRepository.findByCoupleIdOrderByIdDesc(couple.getId());
        if (contents.isEmpty()) {
            return List.of();
        }
        List<Long> contentIds = contents.stream().map(Content::getId).toList();
        Map<Long, LogSummary> summaries = contentLogRepository
                .summarize(contentIds)
                .stream()
                .collect(Collectors.toMap(LogSummary::getContentId, Function.identity()));
        Map<Long, List<ContentRating>> ratingsByContent = contentRatingRepository.findByContentIdIn(contentIds)
                .stream()
                .collect(Collectors.groupingBy(ContentRating::getContentId));
        Map<Long, List<ContentLog>> logsByContent = contentLogRepository
                .findByContentIdInOrderByContentIdAscIdDesc(contentIds)
                .stream()
                .collect(Collectors.groupingBy(ContentLog::getContentId));
        return contents.stream()
                .map(c -> toResponse(c, summaries.get(c.getId()),
                        ratingPairOf(ratingsByContent.getOrDefault(c.getId(), List.of()), userId),
                        coverOf(logsByContent.getOrDefault(c.getId(), List.of()))))
                .toList();
    }

    /** 콘텐츠 단건 조회 — 상세 화면 정보 카드 */
    public ContentResponse get(Long userId, Long contentId) {
        return withSummary(getCoupleContent(userId, contentId), userId);
    }

    /** 콘텐츠 수정 — 커플 둘 다 가능 */
    @Transactional
    public ContentResponse update(Long userId, Long contentId, UpdateContentRequest request) {
        Content content = getCoupleContent(userId, contentId);
        content.update(request.title(), request.type(), request.posterUrl());
        return withSummary(content, userId);
    }

    /** 콘텐츠 삭제 — 관람 기록도 함께 삭제(DB ON DELETE CASCADE) */
    @Transactional
    public void delete(Long userId, Long contentId) {
        Content content = getCoupleContent(userId, contentId);
        // 콘텐츠를 지우면 그 콘텐츠의 관람 기록도 사라진다 — 그 카드에 달렸던 반응까지 함께
        // (PlaceService.delete 와 같은 이유 — feed_reactions 는 대상이 여러 테이블이라 FK 없음)
        feedReactionRepository.deleteByTargetTypeAndTargetIdIn(FeedItemType.CONTENT_LOG,
                contentLogRepository.findByContentIdOrderByIdDesc(contentId).stream()
                        .map(ContentLog::getId).toList());
        contentRepository.delete(content);
    }

    /** 관람 기록 추가 — 상대에게 푸시 */
    @Transactional
    public ContentLogResponse recordLog(Long userId, Long contentId, RecordContentLogRequest request) {
        Content content = getCoupleContent(userId, contentId);

        ContentLog log = ContentLog.builder()
                .contentId(content.getId())
                .loggedBy(userId)
                .watchedAt(request.watchedAt())
                .rating(request.rating())
                .memo(request.memo())
                .imageUrl(request.imageUrl())
                .build();
        contentLogRepository.save(log);

        Long partnerId = activeCouple(userId).partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "새 콘텐츠 관람 기록!",
                    userName(userId) + " — " + content.getTitle()
                            + (log.getRating() != null ? " ★" + log.getRating() : ""),
                    PushLinks.content(content.getId()));
        }
        return ContentLogResponse.of(log, userName(userId));
    }

    /** 콘텐츠의 관람 기록 목록 */
    public List<ContentLogResponse> logs(Long userId, Long contentId) {
        getCoupleContent(userId, contentId);
        return contentLogRepository.findByContentIdOrderByIdDesc(contentId).stream()
                .map(l -> ContentLogResponse.of(l, userName(l.getLoggedBy())))
                .toList();
    }

    /** 관람 기록 삭제 — 기록한 본인만 */
    @Transactional
    public void deleteLog(Long userId, Long contentId, Long logId) {
        getCoupleContent(userId, contentId);
        ContentLog log = contentLogRepository.findById(logId)
                .filter(l -> contentId.equals(l.getContentId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTENT_LOG_NOT_FOUND));
        if (!userId.equals(log.getLoggedBy())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 남긴 관람 기록만 삭제할 수 있습니다.");
        }
        // 피드 카드 응원 반응 — 다형 참조라 FK 가 없어 직접 지운다 (PlaceService.deleteVisit 와 같은 이유)
        feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.CONTENT_LOG, logId);
        contentLogRepository.delete(log);
    }

    /**
     * 럽슐랭 대표 평점 등록/수정 — 콘텐츠당 한 사람당 1개만 유지되며 재평가 시 덮어쓴다.
     * 두 사람 평점이 모두 모이면 등급(tier)을 재산정하고, 새로 등극했을 때만 상대에게 알린다.
     * 상대가 아직 평가 전이면 <b>내 첫 평가 때 한 번만</b> 재촉 푸시를 보낸다.
     * (규칙은 {@link com.fitto.place.service.PlaceService#rate} 와 완전히 동일 — 미러링)
     */
    @Transactional
    public ContentResponse rate(Long userId, Long contentId, RateContentRequest request) {
        Content content = getCoupleContent(userId, contentId);

        ContentRating mine = contentRatingRepository.findByContentIdAndUserId(contentId, userId)
                .orElse(null);
        boolean firstRating = mine == null;
        if (mine == null) {
            mine = ContentRating.builder()
                    .contentId(contentId)
                    .userId(userId)
                    .rating(request.rating())
                    .revisitIntent(request.revisitIntent())
                    .build();
            contentRatingRepository.save(mine);
        } else {
            mine.update(request.rating(), request.revisitIntent());
        }

        List<ContentRating> ratings = contentRatingRepository.findByContentId(contentId);
        RatingPair pair = ratingPairOf(ratings, userId);

        int previousTier = content.getLovelichelinTier();
        int newTier = computeTier(pair.mine(), pair.partner());
        if (newTier != previousTier) {
            if (previousTier == 0 && newTier > 0) {
                content.applyLovelichelinTier(newTier, LocalDateTime.now());
                Long partnerId = activeCouple(userId).partnerOf(userId);
                if (partnerId != null) {
                    notificationService.notify(partnerId, NotificationCategory.PARTNER,
                            "럽슐랭 " + newTier + "스타 등극! 🎉",
                            content.getTitle() + "이(가) 우리 둘의 럽슐랭으로 인증됐어요.",
                            PushLinks.content(content.getId()));
                }
            } else if (newTier == 0) {
                content.applyLovelichelinTier(0, null);
            } else {
                content.applyLovelichelinTier(newTier, content.getLovelichelinCertifiedAt());
            }
        }

        if (firstRating && pair.partner() == null) {
            Long partnerId = activeCouple(userId).partnerOf(userId);
            if (partnerId != null) {
                notificationService.notify(partnerId, NotificationCategory.PARTNER, "럽슐랭 평가를 기다려요 ⭐",
                        userName(userId) + "이(가) " + content.getTitle()
                                + "에 별점을 남겼어요. 당신의 평점이 등급을 결정해요!",
                        PushLinks.content(content.getId()));
            }
        }

        LogSummary s = contentLogRepository.summarize(List.of(contentId)).stream().findFirst().orElse(null);
        Cover cover = coverOf(contentLogRepository.findByContentIdOrderByIdDesc(contentId));
        return toResponse(content, s, pair, cover);
    }

    // ---- helpers ----

    private ContentResponse toResponse(Content content, LogSummary s, RatingPair pair, Cover cover) {
        return ContentResponse.of(content,
                s == null ? 0 : s.getLogCount(),
                s == null ? null : s.getAvgRating(),
                s == null ? null : s.getLastWatchedAt(),
                pair.mine(), pair.partner(),
                cover == null ? null : cover.imageUrl(),
                cover == null ? null : cover.memo());
    }

    /** 럽슐랭 가이드 매거진 카드 커버 — 사진 있는 가장 최근 관람 기록, 없으면 그냥 가장 최근 기록 */
    private Cover coverOf(List<ContentLog> logsMostRecentFirst) {
        if (logsMostRecentFirst.isEmpty()) {
            return null;
        }
        ContentLog withPhoto = logsMostRecentFirst.stream()
                .filter(l -> l.getImageUrl() != null)
                .findFirst()
                .orElse(logsMostRecentFirst.get(0));
        return new Cover(withPhoto.getImageUrl(), withPhoto.getMemo());
    }

    private record Cover(String imageUrl, String memo) {
    }

    /**
     * 럽슐랭 등급 산정 — {@link com.fitto.place.service.PlaceService#computeTier} 와 완전히
     * 동일한 규칙(둘 다 평가해야 하고, 한쪽이라도 2점 이하면 탈락). 도메인이 갈려 있어 이
     * 6줄짜리 순수 함수만 그대로 복제했다 — 패키지 간 의존을 만들 정도의 크기가 아니다.
     */
    static int computeTier(Integer my, Integer partner) {
        if (my == null || partner == null) {
            return 0;
        }
        if (my <= 2 || partner <= 2) {
            return 0;
        }
        double avg = (my + partner) / 2.0;
        if (avg >= 5.0) {
            return 3;
        }
        if (avg >= 4.0) {
            return 2;
        }
        return 1;
    }

    static RatingPair ratingPairOf(List<ContentRating> ratings, Long userId) {
        Integer mine = null;
        Integer partner = null;
        for (ContentRating r : ratings) {
            if (userId.equals(r.getUserId())) {
                mine = r.getRating();
            } else {
                partner = r.getRating();
            }
        }
        return new RatingPair(mine, partner);
    }

    record RatingPair(Integer mine, Integer partner) {
        static final RatingPair EMPTY = new RatingPair(null, null);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private Content getCoupleContent(Long userId, Long contentId) {
        Content content = contentRepository.findById(contentId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CONTENT_NOT_FOUND));
        if (!content.getCoupleId().equals(activeCouple(userId).getId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return content;
    }

    private ContentResponse withSummary(Content content, Long userId) {
        LogSummary s = contentLogRepository.summarize(List.of(content.getId()))
                .stream().findFirst().orElse(null);
        RatingPair pair = ratingPairOf(contentRatingRepository.findByContentId(content.getId()), userId);
        Cover cover = coverOf(contentLogRepository.findByContentIdOrderByIdDesc(content.getId()));
        return toResponse(content, s, pair, cover);
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
