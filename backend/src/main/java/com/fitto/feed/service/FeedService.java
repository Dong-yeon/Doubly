package com.fitto.feed.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinaryUrls;
import com.fitto.content.domain.ContentLog;
import com.fitto.content.repository.ContentLogRepository;
import com.fitto.content.repository.ContentLogRepository.LogWithContent;
import com.fitto.content.repository.ContentRepository;
import com.fitto.diet.domain.Meal;
import com.fitto.diet.repository.MealRepository;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.domain.FeedPostPhoto;
import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.UpdatePostRequest;
import com.fitto.feed.dto.FeedCursor;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedPhotoMapResponse;
import com.fitto.feed.dto.FeedPhotoMonthResponse;
import com.fitto.feed.dto.FeedPhotoResponse;
import com.fitto.feed.dto.FeedPhotosResponse;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.repository.FeedPostPhotoRepository;
import com.fitto.feed.repository.FeedPostRepository;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.repository.PlaceRepository;
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

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 커플 일상 피드 — PLAN.md Couple Feed. 포스트 + 운동/식단/맛집 방문을
 * 원본 테이블에서 병합해 하나의 타임라인으로 만든다 (복제 테이블 없음).
 */
@Service
@Transactional(readOnly = true)
public class FeedService {

    private static final int MAX_LIMIT = 50;

    /** 한 포스트에 담을 수 있는 사진 장수 상한 — Instagram 류 앱을 넘길 이유가 없다. */
    private static final int MAX_PHOTOS_PER_POST = 5;

    /**
     * 사진첩이 훑는 소스 — 사진이 달릴 수 있는 기록 전부.
     * {@code CONTENT_LOG}(영화·공연 관람)는 뺀다: 이미지가 포스터라 "우리가 찍은 사진"이 아니다.
     */
    private static final Set<FeedItemType> PHOTO_SOURCES = EnumSet.of(
            FeedItemType.POST, FeedItemType.MEAL, FeedItemType.WORKOUT, FeedItemType.PLACE_VISIT);

    /** 사진첩 지도가 읽는 사진 방문 상한 — 넘치면 응답의 truncated 로 알린다. */
    private static final int MAP_CAP = 1000;

    /** 사진첩 달력이 한 소스에서 한 달에 읽는 상한 — 넘치면 응답의 truncated 로 알린다. */
    private static final int MONTH_CAP = 500;

    /** 사진첩 정렬 — (기록일, 올린 시각, id) 내림차순. 소스별 쿼리의 정렬키와 같아야 병합이 맞다. */
    private static final Comparator<PhotoCandidate> PHOTO_ORDER = Comparator
            .comparing(PhotoCandidate::recordDate)
            .thenComparing((PhotoCandidate c) -> c.item().occurredAt())
            .thenComparing(c -> c.item().refId())
            .reversed();

    /**
     * 사진첩에서 기록일 컬럼으로 keyset 을 거는 소스 — 커서 위치에 날짜가 있어야 이어 읽는다.
     * 일상 포스트는 V119 에서 record_date 가 생겨 함께 들어왔다(그 전엔 created_at 만으로 넘겼다).
     */
    private static final Set<FeedItemType> DATED_PHOTO_SOURCES = EnumSet.of(
            FeedItemType.POST, FeedItemType.MEAL, FeedItemType.WORKOUT, FeedItemType.PLACE_VISIT);

    /** 기록일 하한 — 이보다 앞 날짜는 입력 실수로 본다(날짜 선택기가 연도를 잘못 굴린 경우 등) */
    private static final LocalDate MIN_RECORD_DATE = LocalDate.of(2000, 1, 1);

    private final FeedPostRepository feedPostRepository;
    private final FeedPostPhotoRepository feedPostPhotoRepository;
    private final FeedReactionRepository feedReactionRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final PlaceVisitRepository placeVisitRepository;
    private final PlaceRepository placeRepository;
    private final ContentLogRepository contentLogRepository;
    private final ContentRepository contentRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final FeedItemMapper mapper;
    private final CloudinaryImageDeleter imageDeleter;
    private final CloudinaryProperties cloudinaryProperties;

    public FeedService(FeedPostRepository feedPostRepository,
                       FeedPostPhotoRepository feedPostPhotoRepository,
                       FeedReactionRepository feedReactionRepository,
                       RelationRepository relationRepository,
                       WorkoutRepository workoutRepository,
                       MealRepository mealRepository,
                       PlaceVisitRepository placeVisitRepository,
                       PlaceRepository placeRepository,
                       ContentLogRepository contentLogRepository,
                       ContentRepository contentRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       FeedItemMapper mapper,
                       CloudinaryImageDeleter imageDeleter,
                       CloudinaryProperties cloudinaryProperties) {
        this.imageDeleter = imageDeleter;
        this.cloudinaryProperties = cloudinaryProperties;
        this.feedPostRepository = feedPostRepository;
        this.feedPostPhotoRepository = feedPostPhotoRepository;
        this.feedReactionRepository = feedReactionRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.placeVisitRepository = placeVisitRepository;
        this.placeRepository = placeRepository;
        this.contentLogRepository = contentLogRepository;
        this.contentRepository = contentRepository;
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
        return timeline(userId, cursor, limit, Set.of());
    }

    /**
     * @param exclude 빼고 볼 소스 — 홈 열의 "최근 기록 한 줄"은 식단·운동·일상을 보여 주고 장소 방문·콘텐츠
     *                관람은 뺀다(그날의 식단·운동 글이 럽슐랭 기록에 밀려나지 않게). <b>쿼리 자체를 건너뛴다</b> —
     *                받아서 거르면 그 소스가 {@code limit} 을 다 채운 날에는 나머지가 한 건도 안 실린다.
     *                비어 있으면 전부(피드 화면). 빠진 소스의 커서 위치는 그대로 남는다({@link #nextCursorOf}).
     */
    public FeedTimelineResponse timeline(Long userId, String cursor, int limit, Set<FeedItemType> exclude) {
        Relation couple = activeCouple(userId);
        int size = Math.min(Math.max(limit, 1), MAX_LIMIT);
        FeedCursor from = FeedCursor.decode(cursor);
        // 다음 페이지 존재 여부를 알려면 한 건 더 읽어야 한다
        Pageable page = PageRequest.of(0, size + 1);

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = mapper.userNames(userIds);

        Set<FeedItemType> skip = exclude == null ? Set.of() : exclude;
        List<FeedItemResponse> merged = new ArrayList<>();
        if (!skip.contains(FeedItemType.POST)) {
            List<FeedPost> posts = feedPostRepository.findTimeline(couple.getId(),
                    from.createdAtOf(FeedItemType.POST), from.idOf(FeedItemType.POST), page);
            Map<Long, List<String>> photosByPost = mapper.photosByPostId(posts);
            for (FeedPost p : posts) {
                merged.add(mapper.toItem(p, names, userId, null, photosByPost.getOrDefault(p.getId(), List.of())));
            }
        }
        if (!skip.contains(FeedItemType.WORKOUT)) {
            for (Workout w : workoutRepository.findRecentForFeed(userIds,
                    from.createdAtOf(FeedItemType.WORKOUT), from.idOf(FeedItemType.WORKOUT), page)) {
                merged.add(mapper.toItem(w, names, userId));
            }
        }
        if (!skip.contains(FeedItemType.MEAL)) {
            List<Meal> meals = mealRepository.findRecentForFeed(userIds,
                    from.createdAtOf(FeedItemType.MEAL), from.idOf(FeedItemType.MEAL), page);
            Map<Long, String> placeNameByMealId = placeNamesOf(meals);
            for (Meal m : meals) {
                merged.add(mapper.toItem(m, names, userId, placeNameByMealId.get(m.getId())));
            }
        }
        if (!skip.contains(FeedItemType.PLACE_VISIT)) {
            for (VisitWithPlace v : placeVisitRepository.findRecentForFeed(couple.getId(),
                    from.createdAtOf(FeedItemType.PLACE_VISIT), from.idOf(FeedItemType.PLACE_VISIT), page)) {
                merged.add(mapper.toItem(v, names, userId));
            }
        }
        if (!skip.contains(FeedItemType.CONTENT_LOG)) {
            for (LogWithContent l : contentLogRepository.findRecentForFeed(couple.getId(),
                    from.createdAtOf(FeedItemType.CONTENT_LOG), from.idOf(FeedItemType.CONTENT_LOG), page)) {
                merged.add(mapper.toItem(l, names, userId));
            }
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
     * 이 끼니들에 연결된 장소 이름 — {@code meal_id → placeName}, 없으면 키 자체가 없다.
     *
     * <p>{@code PlaceVisit.mealId} 가 유일한 연결고리라 역방향으로 찾아야 한다
     * ({@code PlaceVisitRepository.findByMealIdIn} 주석 참고). 카드마다 부르면 N+1 이므로
     * 페이지 단위로 한 번만 조회한다.
     *
     * <p>한 끼니에 방문이 여러 건 붙는 일은 없지만, 있더라도 먼저 온 것을 쓴다 —
     * 부제에 들어갈 자리는 한 곳뿐이다.
     */
    private Map<Long, String> placeNamesOf(List<Meal> meals) {
        Map<Long, String> byMealId = new LinkedHashMap<>();
        placeLinksOf(meals).forEach((mealId, vp) -> byMealId.put(mealId, vp.getPlaceName()));
        return byMealId;
    }

    /** {@link #placeNamesOf} 의 원본 — 사진첩은 이름뿐 아니라 장소 id 도 필요하다(장소 상세로 이동). */
    private Map<Long, VisitWithPlace> placeLinksOf(List<Meal> meals) {
        if (meals.isEmpty()) {
            return Map.of();
        }
        Map<Long, VisitWithPlace> byMealId = new LinkedHashMap<>();
        for (VisitWithPlace vp : placeVisitRepository.findByMealIdIn(meals.stream().map(Meal::getId).toList())) {
            byMealId.putIfAbsent(vp.getVisit().getMealId(), vp);
        }
        return byMealId;
    }

    /**
     * 사진첩("우리" 탭) — 일상·식단·운동·맛집 중 <b>사진이 있는</b> 기록을 합쳐 기록일 최신순으로 준다.
     *
     * <p><b>정렬은 (기록일, created_at, id) 내림차순</b>(2026-10-02 결정). 기록일은 식단
     * {@code meal_date} · 운동 {@code workout_date} · 방문 {@code visited_at} · 일상 {@code record_date}(V119,
     * 고르지 않았으면 올린 날)다. 지난 날짜로
     * 늦게 올린 끼니가 "올린 달"이 아니라 "먹은 날"에 묶여야 월 묶음·달력·회고가 맞는다.
     * 타임라인({@link #timeline})은 업로드 순서 그대로 둔다 — 피드는 "방금 무엇이 올라왔나"다.
     *
     * <p>새 컨트롤러를 만들지 않는 이유: 앨범은 피드의 다른 보기다(같은 4소스, 같은 커서,
     * 사진만 남긴 것). {@link #timeline} 과 같은 소스별 keyset·Java 병합을 그대로 쓴다 —
     * SQL {@code UNION} 은 H2/PostgreSQL 양립 규칙 때문에 쓰지 않는다(CLAUDE.md 4절).
     *
     * <p>{@code sources} 로 소스를 골라낼 수 있다(상단 필터 칩). 비었으면 4소스 전부.
     * 중복 제거 규칙은 각 리포지토리 쿼리에 박혀 있다 — 데이트 식단 복제본 제외,
     * 식단에서 파생된 방문 제외(docs/ALBUM_TAB_IA_2026-09-14.md 5-4).
     */
    public FeedPhotosResponse photos(Long userId, String cursor, int limit, List<FeedItemType> sources) {
        return photos(userId, cursor, limit, sources, null);
    }

    /**
     * @param who {@code "me"} · {@code "partner"} 면 그 사람이 올린 사진만, null·빈 값이면 둘 다.
     *            커서는 필터마다 따로다 — 필터를 바꾸면 클라이언트가 첫 페이지부터 다시 읽는다.
     */
    public FeedPhotosResponse photos(Long userId, String cursor, int limit, List<FeedItemType> sources,
                                     String who) {
        Relation couple = activeCouple(userId);
        int size = Math.min(Math.max(limit, 1), MAX_LIMIT);
        FeedCursor from = FeedCursor.decode(cursor);
        // 다음 페이지 존재 여부를 알려면 소스마다 한 건 더 읽어야 한다(타임라인과 같은 이유)
        Pageable page = PageRequest.of(0, size + 1);

        Set<FeedItemType> wanted = (sources == null || sources.isEmpty())
                ? PHOTO_SOURCES
                : EnumSet.copyOf(sources);

        /*
         * 기록일 정렬 이전에 발급된 커서(날짜 없음)는 이어 읽을 수 없다 — 위치의 의미가 다르다.
         * 배포 직후 스크롤 중이던 앱이 들고 있을 수 있으므로 오류 대신 첫 페이지로 되돌린다
         * (FeedCursor.decode 의 해석 실패와 같은 원칙). 앱은 받은 항목을 키로 중복 제거한다.
         */
        for (FeedItemType type : DATED_PHOTO_SOURCES) {
            if (from.positionOf(type) != null && from.recordDateOf(type) == null) {
                from = FeedCursor.first();
                break;
            }
        }

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = mapper.userNames(userIds);

        /*
         * 작성자 필터 — 받은 페이지를 클라이언트에서 거르면(FeedTimelineScreen 의 who 방식)
         * 한쪽이 몰아 올린 날 반대쪽 화면이 빈 페이지만 받는다. 사진첩은 그리드가 비어 보이면
         * 끝난 줄 알므로 서버에서 거른다.
         */
        Long authorId = authorOf(who, userId, partnerId);
        if (authorId != null) {
            if (authorId == -1L) {
                return new FeedPhotosResponse(List.of(), null, false); // 상대가 없는 관계에서 '상대'
            }
            userIds = List.of(authorId);
        }

        List<PhotoCandidate> merged = new ArrayList<>();
        if (wanted.contains(FeedItemType.POST)) {
            LocalDate date = from.recordDateOf(FeedItemType.POST);
            LocalDateTime at = from.createdAtOf(FeedItemType.POST);
            Long id = from.idOf(FeedItemType.POST);
            merged.addAll(postCandidates(authorId != null
                    ? feedPostRepository.findPhotosByAuthor(couple.getId(), authorId, date, at, id, page)
                    : feedPostRepository.findPhotos(couple.getId(), date, at, id, page), names, userId));
        }
        if (wanted.contains(FeedItemType.MEAL)) {
            merged.addAll(mealCandidates(mealRepository.findPhotosForFeed(userIds, from.recordDateOf(FeedItemType.MEAL),
                    from.createdAtOf(FeedItemType.MEAL), from.idOf(FeedItemType.MEAL), page), names, userId));
        }
        if (wanted.contains(FeedItemType.WORKOUT)) {
            merged.addAll(workoutCandidates(workoutRepository.findPhotosForFeed(userIds,
                    from.recordDateOf(FeedItemType.WORKOUT), from.createdAtOf(FeedItemType.WORKOUT),
                    from.idOf(FeedItemType.WORKOUT), page), names, userId));
        }
        if (wanted.contains(FeedItemType.PLACE_VISIT)) {
            LocalDate date = from.recordDateOf(FeedItemType.PLACE_VISIT);
            LocalDateTime at = from.createdAtOf(FeedItemType.PLACE_VISIT);
            Long id = from.idOf(FeedItemType.PLACE_VISIT);
            merged.addAll(visitCandidates(authorId != null
                    ? placeVisitRepository.findPhotosForFeedByVisitor(couple.getId(), authorId, date, at, id, page)
                    : placeVisitRepository.findPhotosForFeed(couple.getId(), date, at, id, page), names, userId));
        }

        /*
         * 병합 정렬키는 소스별 쿼리의 정렬키와 같아야 한다 — (기록일, created_at, id). 네 소스 모두 그 순서로 읽는다.
         */
        merged.sort(PHOTO_ORDER);

        boolean hasMore = merged.size() > size;
        List<PhotoCandidate> picked = hasMore ? merged.subList(0, size) : merged;

        String nextCursor = picked.isEmpty() ? null : photoCursorOf(from, picked).encode();

        return new FeedPhotosResponse(toPhotoResponses(picked, userId), nextCursor, hasMore);
    }

    /**
     * 사진첩 달력 — 한 달(기록일 기준)의 사진 전부. 페이징 없이 한 번에 준다: 달력은 그 달의
     * 칸을 한꺼번에 그려야 하고, 한 달치는 작다. 정렬·필터·중복 제거·캡션은 {@link #photos} 와 같다.
     *
     * <p>소스마다 {@value #MONTH_CAP} 건까지만 읽는다 — 넘치면 {@code truncated}. 한 달에 한 소스로
     * 수백 장을 올리는 커플은 드물지만, 상한 없는 조회를 운영에 두지 않는다.
     *
     * @param month {@code YYYY-MM}. 비우면 이번 달(KST).
     */
    public FeedPhotoMonthResponse photoMonth(Long userId, String month, List<FeedItemType> sources, String who) {
        YearMonth ym;
        try {
            ym = month == null || month.isBlank() ? YearMonth.from(KstClock.today()) : YearMonth.parse(month);
        } catch (java.time.format.DateTimeParseException e) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "달은 YYYY-MM 형식이어야 합니다: " + month);
        }
        Relation couple = activeCouple(userId);
        Set<FeedItemType> wanted = (sources == null || sources.isEmpty()) ? PHOTO_SOURCES : EnumSet.copyOf(sources);

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = mapper.userNames(userIds);
        Long authorId = authorOf(who, userId, partnerId);
        if (authorId != null) {
            if (authorId == -1L) {
                return new FeedPhotoMonthResponse(ym.toString(), List.of(), false);
            }
            userIds = List.of(authorId);
        }
        Long only = authorId;

        LocalDate first = ym.atDay(1);
        LocalDate last = ym.atEndOfMonth();
        Pageable cap = PageRequest.of(0, MONTH_CAP + 1);
        List<PhotoCandidate> merged = new ArrayList<>();
        boolean truncated = false;

        if (wanted.contains(FeedItemType.POST)) {
            List<FeedPost> posts = feedPostRepository.findPhotosInDateRange(couple.getId(), first, last, cap);
            truncated |= posts.size() > MONTH_CAP;
            merged.addAll(postCandidates(posts.stream().limit(MONTH_CAP)
                    .filter(p -> only == null || only.equals(p.getAuthorId())).toList(), names, userId));
        }
        if (wanted.contains(FeedItemType.MEAL)) {
            List<Meal> meals = mealRepository.findPhotosInDateRange(userIds, first, last, cap);
            truncated |= meals.size() > MONTH_CAP;
            merged.addAll(mealCandidates(meals.stream().limit(MONTH_CAP).toList(), names, userId));
        }
        if (wanted.contains(FeedItemType.WORKOUT)) {
            List<Workout> workouts = workoutRepository.findPhotosInDateRange(userIds, first, last, cap);
            truncated |= workouts.size() > MONTH_CAP;
            merged.addAll(workoutCandidates(workouts.stream().limit(MONTH_CAP).toList(), names, userId));
        }
        if (wanted.contains(FeedItemType.PLACE_VISIT)) {
            List<VisitWithPlace> visits = placeVisitRepository.findPhotosInDateRange(couple.getId(), first, last, cap);
            truncated |= visits.size() > MONTH_CAP;
            merged.addAll(visitCandidates(visits.stream().limit(MONTH_CAP)
                    .filter(v -> only == null || only.equals(v.getVisit().getVisitedBy())).toList(), names, userId));
        }

        merged.sort(PHOTO_ORDER);
        return new FeedPhotoMonthResponse(ym.toString(), toPhotoResponses(merged, userId), truncated);
    }

    /**
     * 사진첩 지도 — 좌표가 있는 장소에 걸린 사진을 <b>장소별로</b> 묶는다. 맛집 방문 사진과 장소를 붙여
     * 기록한 끼니 사진이 대상이다(일상·운동은 위치가 없다). 장소는 가장 최근 기록일 순.
     *
     * <p>파생 방문(끼니에서 만들어진 방문)은 끼니 항목으로 바꿔 싣는다 — 사진첩 그리드와 같은 기록이
     * 같은 (type, refId) 로 보여야 반응·중복 제거가 맞는다. 끼니는 사진첩과 같은 규칙(사진 있음·데이트
     * 식단 복제본 제외)을 다시 건다.
     *
     * <p>방문은 {@value #MAP_CAP} 건까지 읽는다 — 넘치면 {@code truncated}.
     */
    public FeedPhotoMapResponse photoMap(Long userId, List<FeedItemType> sources, String who) {
        Relation couple = activeCouple(userId);
        Set<FeedItemType> wanted = (sources == null || sources.isEmpty()) ? PHOTO_SOURCES : EnumSet.copyOf(sources);
        boolean wantVisits = wanted.contains(FeedItemType.PLACE_VISIT);
        boolean wantMeals = wanted.contains(FeedItemType.MEAL);
        if (!wantVisits && !wantMeals) {
            return new FeedPhotoMapResponse(List.of(), false); // 일상·운동만 고른 칩 — 지도에 앉을 사진이 없다
        }

        Long partnerId = couple.partnerOf(userId);
        List<Long> userIds = partnerId != null ? List.of(userId, partnerId) : List.of(userId);
        Map<Long, String> names = mapper.userNames(userIds);
        Long authorId = authorOf(who, userId, partnerId);
        if (authorId != null && authorId == -1L) {
            return new FeedPhotoMapResponse(List.of(), false);
        }

        List<PlaceVisitRepository.VisitOnMap> rows =
                placeVisitRepository.findPhotoVisitsOnMap(couple.getId(), PageRequest.of(0, MAP_CAP + 1));
        boolean truncated = rows.size() > MAP_CAP;
        if (truncated) {
            rows = rows.subList(0, MAP_CAP);
        }

        Map<Long, PlaceVisitRepository.VisitOnMap> placeOf = new LinkedHashMap<>(); // placeId → 좌표·이름
        List<VisitWithPlace> visits = new ArrayList<>();
        Map<Long, Long> placeIdByMealId = new LinkedHashMap<>();
        for (PlaceVisitRepository.VisitOnMap r : rows) {
            placeOf.putIfAbsent(r.getVisit().getPlaceId(), r);
            if (r.getVisit().getMealId() == null) {
                if (wantVisits && (authorId == null || authorId.equals(r.getVisit().getVisitedBy()))) {
                    visits.add(r);
                }
            } else if (wantMeals) {
                placeIdByMealId.putIfAbsent(r.getVisit().getMealId(), r.getVisit().getPlaceId());
            }
        }

        List<PhotoCandidate> candidates = new ArrayList<>(visitCandidates(visits, names, userId));
        if (!placeIdByMealId.isEmpty()) {
            List<Meal> meals = mealRepository.findAllById(placeIdByMealId.keySet()).stream()
                    .filter(m -> m.getPhotoUrl() != null)
                    .filter(m -> m.getCreatedBy() == null || m.getCreatedBy().equals(m.getUserId()))
                    .filter(m -> userIds.contains(m.getUserId()))
                    .filter(m -> authorId == null || authorId.equals(m.getUserId()))
                    .toList();
            candidates.addAll(mealCandidates(meals, names, userId));
        }
        candidates.sort(PHOTO_ORDER);

        // 장소별로 모은다 — 정렬된 후보를 순서대로 넣으므로 장소 안에서도, 장소끼리도 최신순이 된다
        Map<Long, List<PhotoCandidate>> byPlace = new LinkedHashMap<>();
        for (PhotoCandidate c : candidates) {
            if (c.placeId() != null && placeOf.containsKey(c.placeId())) {
                byPlace.computeIfAbsent(c.placeId(), k -> new ArrayList<>()).add(c);
            }
        }
        List<PhotoCandidate> flat = byPlace.values().stream().flatMap(List::stream).toList();
        List<FeedPhotoResponse> responses = toPhotoResponses(flat, userId);

        List<FeedPhotoMapResponse.PlacePhotos> places = new ArrayList<>();
        int i = 0;
        for (Map.Entry<Long, List<PhotoCandidate>> e : byPlace.entrySet()) {
            PlaceVisitRepository.VisitOnMap p = placeOf.get(e.getKey());
            int n = e.getValue().size();
            places.add(new FeedPhotoMapResponse.PlacePhotos(e.getKey(), p.getPlaceName(),
                    p.getLat().doubleValue(), p.getLng().doubleValue(), responses.subList(i, i + n)));
            i += n;
        }
        return new FeedPhotoMapResponse(places, truncated);
    }


    /*
     * 소스별 후보 만들기 — 페이지 조회({@link #photos})와 달 조회({@link #photoMonth})가 같이 쓴다.
     * 타임라인 아이템으로 한 번 변환한 뒤 사진 항목으로 옮긴다. 캡션 문구를 타임라인과 <b>같은 코드</b>로
     * 만들려는 것 — 따로 만들면 같은 기록이 화면마다 다르게 읽힌다(제목 규칙이 두 벌).
     */

    private List<PhotoCandidate> postCandidates(List<FeedPost> posts, Map<Long, String> names, Long viewerId) {
        Map<Long, List<String>> photosByPost = mapper.photosByPostId(posts);
        List<PhotoCandidate> out = new ArrayList<>();
        for (FeedPost p : posts) {
            List<String> urls = photosByPost.getOrDefault(p.getId(), List.of());
            out.add(new PhotoCandidate(mapper.toItem(p, names, viewerId, null, urls), recordDateOf(p),
                    p.getImageUrl(), urls, p.getTripId(), null, null));
        }
        return out;
    }

    private List<PhotoCandidate> mealCandidates(List<Meal> meals, Map<Long, String> names, Long viewerId) {
        Map<Long, VisitWithPlace> placeByMealId = placeLinksOf(meals);
        List<PhotoCandidate> out = new ArrayList<>();
        for (Meal m : meals) {
            VisitWithPlace place = placeByMealId.get(m.getId());
            String placeName = place != null ? place.getPlaceName() : null;
            out.add(new PhotoCandidate(mapper.toItem(m, names, viewerId, placeName), m.getMealDate(),
                    m.getPhotoUrl(), List.of(), null,
                    place != null ? place.getVisit().getPlaceId() : null, placeName));
        }
        return out;
    }

    private List<PhotoCandidate> workoutCandidates(List<Workout> workouts, Map<Long, String> names, Long viewerId) {
        List<PhotoCandidate> out = new ArrayList<>();
        for (Workout w : workouts) {
            out.add(new PhotoCandidate(mapper.toItem(w, names, viewerId), w.getWorkoutDate(),
                    w.getImageUrl(), List.of(), null, null, null));
        }
        return out;
    }

    private List<PhotoCandidate> visitCandidates(List<VisitWithPlace> visits, Map<Long, String> names, Long viewerId) {
        List<PhotoCandidate> out = new ArrayList<>();
        for (VisitWithPlace v : visits) {
            out.add(new PhotoCandidate(mapper.toItem(v, names, viewerId), v.getVisit().getVisitedAt(),
                    v.getVisit().getImageUrl(), List.of(), null,
                    v.getVisit().getPlaceId(), v.getPlaceName()));
        }
        return out;
    }

    /**
     * 후보 → 응답. 반응은 타임라인과 같은 {@code attachReactions} 로 <b>한 번에</b> 붙인다(종류별 IN 조회 —
     * 칸마다 부르면 N+1). 뷰어에서 남긴 반응이 타임라인 카드와 같은 행이라 어디서 봐도 같다.
     * attachReactions 는 입력 순서를 지키므로 인덱스로 맞춘다.
     */
    private List<FeedPhotoResponse> toPhotoResponses(List<PhotoCandidate> picked, Long viewerId) {
        List<FeedItemResponse> withReactions =
                mapper.attachReactions(picked.stream().map(PhotoCandidate::item).toList(), viewerId);
        List<FeedPhotoResponse> out = new ArrayList<>(picked.size());
        for (int i = 0; i < picked.size(); i++) {
            out.add(toPhotoResponse(picked.get(i), withReactions.get(i).reactions()));
        }
        return out;
    }

    private static FeedPhotoResponse toPhotoResponse(PhotoCandidate c, List<ReactionSummary> reactions) {
        FeedItemResponse item = c.item();
        return new FeedPhotoResponse(
                item.type(),
                item.refId(),
                c.imageUrl(),
                c.imageUrls(),
                captionOf(item),
                item.mine() ? "나" : item.userName(),
                item.mine(),
                c.tripId(),
                c.placeId(),
                c.placeName(),
                c.recordDate(),
                item.occurredAt(),
                reactions != null ? reactions : List.of());
    }

    /**
     * {@code who} → 거를 작성자 id. 거르지 않으면 null, '상대'인데 상대가 없으면 -1.
     * 화면의 칩이 보내는 고정 값이라 모르는 값은 조용히 무시하지 않고 400 으로 드러낸다
     * ({@code sources} 와 같은 원칙 — FeedController).
     */
    private static Long authorOf(String who, Long userId, Long partnerId) {
        if (who == null || who.isBlank()) {
            return null;
        }
        return switch (who.toLowerCase(java.util.Locale.ROOT)) {
            case "me" -> userId;
            case "partner" -> partnerId != null ? partnerId : -1L;
            default -> throw new BusinessException(ErrorCode.INVALID_INPUT, "알 수 없는 작성자 필터입니다: " + who);
        };
    }

    /**
     * 병합·정렬 중간 표현 — 타임라인 아이템에 사진첩만 쓰는 값을 얹는다.
     *
     * <p>{@code imageUrl} 을 <b>원본에서 직접</b> 받는 이유: 타임라인 아이템의 imageUrl 은
     * 운동일 때 늘 null 이다(카드가 운동 사진을 안 그려서 매퍼가 채우지 않는다 —
     * {@code FeedItemMapper.toItem(Workout, ...)}). 사진첩은 그 사진이 본문이므로
     * 아이템에 의존하지 않고 소스 필드를 그대로 쓴다.
     *
     * <p>{@code imageUrls} 는 포스트만 여러 장이고, {@code tripId} 도 포스트에만 있다.
     * {@code placeId}·{@code placeName} 은 맛집 방문과 장소가 붙은 끼니에만 있다.
     */
    private record PhotoCandidate(FeedItemResponse item, LocalDate recordDate, String imageUrl,
                                  List<String> imageUrls, Long tripId,
                                  Long placeId, String placeName) {
    }

    /** 일상 포스트의 기록일 — V119 의 record_date. 기존 행은 올린 시각의 KST 날짜로 채워졌다 */
    private static LocalDate recordDateOf(FeedPost p) {
        return p.getRecordDate();
    }

    /** 사진첩 커서 — {@link #nextCursorOf} 와 같되 위치에 기록일을 함께 담는다(쿼리의 1차 정렬키). */
    private FeedCursor photoCursorOf(FeedCursor previous, List<PhotoCandidate> picked) {
        Map<FeedItemType, FeedCursor.Position> next = new EnumMap<>(previous.positions());
        for (PhotoCandidate c : picked) {
            next.put(c.item().type(),
                    new FeedCursor.Position(c.item().occurredAt(), c.item().refId(), c.recordDate()));
        }
        return new FeedCursor(next);
    }

    /**
     * 뷰어 캡션 — 카드의 제목·부제를 " · " 로 이어 한 줄로 만든다.
     * 일상 포스트는 제목이 없고 글만 있어 그 글이 그대로 캡션이 된다.
     */
    private static String captionOf(FeedItemResponse item) {
        if (item.title() == null || item.title().isBlank()) {
            return item.content();
        }
        if (item.content() == null || item.content().isBlank()) {
            return item.title();
        }
        return item.title() + " · " + item.content();
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

    /** 포스트 작성 (FEED-02) — 글/사진(최대 5장) 중 하나는 필수. 상대에게 푸시 + FEED 이벤트. */
    @Transactional
    public FeedItemResponse createPost(Long userId, CreatePostRequest request) {
        String content = contentOf(request.content());
        List<String> photos = validatedPhotos(request.photosOrEmpty(), content);
        LocalDate recordDate = validatedRecordDate(request.recordDate());

        Relation couple = activeCouple(userId);
        FeedPost post = FeedPost.builder()
                .coupleId(couple.getId())
                .authorId(userId)
                .recordDate(recordDate)
                .content(content)
                // 대표 사진 — 기존 쿼리(findPhotos/findAlbumCandidates 등)가 계속 이 값을 쓴다
                .imageUrl(photos.isEmpty() ? null : photos.get(0))
                .build();
        feedPostRepository.save(post);
        for (int i = 0; i < photos.size(); i++) {
            feedPostPhotoRepository.save(
                    FeedPostPhoto.builder().postId(post.getId()).url(photos.get(i)).orderNo(i).build());
        }

        Long partnerId = couple.partnerOf(userId);
        String authorName = mapper.userName(userId);
        if (partnerId != null) {
            String preview = content != null && !content.isEmpty()
                    ? (content.length() > 40 ? content.substring(0, 40) + "…" : content)
                    : "사진을 남겼어요";
            notificationService.notify(partnerId, NotificationCategory.PARTNER,
                    authorName + "님의 새 일상", preview, PushLinks.FEED);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.FEED);

        return mapper.toItem(post, Map.of(userId, authorName), userId, List.of(), photos);
    }

    /** 글 — 앞뒤 공백을 걷고, 비었으면 null */
    private static String contentOf(String raw) {
        String content = raw != null ? raw.trim() : null;
        return content == null || content.isEmpty() ? null : content;
    }

    /**
     * 사진 목록 검증 — 작성·수정이 같은 규칙을 쓴다. 글·사진 중 하나는 있어야 하고, 최대
     * {@value #MAX_PHOTOS_PER_POST}장, 앱이 공용 업로드 서명(UploadController — 기본 폴더)으로 올린 원본 URL 만.
     * 예전엔 길이만 봐서 아무 URL 이나 저장됐고, 변형 URL 로 남의 원본을 지우는 경로가 열려 있었다
     * (§8-6, 삭제기도 따로 막는다). Cloudinary 미설정(개발·테스트)은 unsigned 폴백이라 폴더를 알 수 없어 보지 않는다.
     */
    private List<String> validatedPhotos(List<String> raw, String content) {
        List<String> photos = raw.stream().map(String::trim).filter(u -> !u.isEmpty()).toList();
        if (content == null && photos.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "글이나 사진 중 하나는 남겨주세요.");
        }
        if (photos.size() > MAX_PHOTOS_PER_POST) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "사진은 최대 " + MAX_PHOTOS_PER_POST + "장까지 올릴 수 있어요.");
        }
        if (cloudinaryProperties.isConfigured()) {
            for (String url : photos) {
                if (!CloudinaryUrls.isImageDirectlyIn(url, cloudinaryProperties, cloudinaryProperties.getFolder())) {
                    throw new BusinessException(ErrorCode.INVALID_INPUT, "앱에서 올린 사진만 남길 수 있어요.");
                }
            }
        }
        return photos;
    }

    /**
     * 기록일 — 이 일이 있었던 날(V119). 고르지 않으면 오늘. 미래는 아직 일어나지 않은 일이라 받지 않는다
     * (식단·운동·하루 기록과 같은 규칙). 오늘은 KST 로 판단한다(CLAUDE.md 4절).
     */
    private static LocalDate validatedRecordDate(LocalDate requested) {
        LocalDate recordDate = requested != null ? requested : KstClock.today();
        if (recordDate.isAfter(KstClock.today())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 오지 않은 날짜에는 남길 수 없어요.");
        }
        if (recordDate.isBefore(MIN_RECORD_DATE)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "날짜를 다시 골라 주세요.");
        }
        return recordDate;
    }

    /** 포스트 하나 — 수정 화면이 불러온다(웹은 화면 파라미터를 URL 에 굽어 본문을 넘기지 않는다). */
    public FeedItemResponse getPost(Long userId, Long postId) {
        FeedPost post = getCouplePost(userId, postId);
        List<String> urls = feedPostPhotoRepository.findByPostIdOrderByOrderNoAsc(postId).stream()
                .map(FeedPostPhoto::getUrl).toList();
        FeedItemResponse item = mapper.toItem(post, mapper.userNames(List.of(post.getAuthorId())), userId, null,
                urls.isEmpty() && post.getImageUrl() != null ? List.of(post.getImageUrl()) : urls);
        return mapper.attachReactions(List.of(item), userId).get(0);
    }

    /**
     * 포스트 고치기 — 작성자 본인만. 글·사진·기록일을 <b>통째로</b> 바꾼다(빠진 사진은 지운 것이다).
     *
     * <p>상대에게 푸시는 보내지 않는다 — 오타 하나 고칠 때마다 폰이 울리면 소음이다. 열려 있는 화면은
     * FEED 이벤트로 다시 읽는다. 반응은 그대로 둔다(같은 기록에 단 마음이다).
     *
     * <p>빠진 사진 파일은 커밋 뒤에 지운다 — 삭제기가 다른 행이 아직 쓰는 파일은 남긴다
     * (CloudinaryImageDeleter.deletable). 새로 붙인 사진의 한도는 앱이 서명받을 때 이미 셌다.
     */
    @Transactional
    public FeedItemResponse updatePost(Long userId, Long postId, UpdatePostRequest request) {
        FeedPost post = getCouplePost(userId, postId);
        if (!userId.equals(post.getAuthorId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 쓴 포스트만 고칠 수 있습니다.");
        }
        String content = contentOf(request.content());
        List<String> photos = validatedPhotos(request.imageUrls() != null ? request.imageUrls() : List.of(), content);
        LocalDate recordDate = validatedRecordDate(request.recordDate());

        List<FeedPostPhoto> before = feedPostPhotoRepository.findByPostIdOrderByOrderNoAsc(postId);
        Set<String> removed = new java.util.LinkedHashSet<>();
        if (post.getImageUrl() != null) {
            removed.add(post.getImageUrl());
        }
        before.forEach(ph -> removed.add(ph.getUrl()));
        removed.removeAll(photos);

        feedPostPhotoRepository.deleteAll(before);
        feedPostPhotoRepository.flush();
        for (int i = 0; i < photos.size(); i++) {
            feedPostPhotoRepository.save(
                    FeedPostPhoto.builder().postId(postId).url(photos.get(i)).orderNo(i).build());
        }
        post.edit(content, photos.isEmpty() ? null : photos.get(0), recordDate);

        coupleEventPublisher.publish(post.getCoupleId(), CoupleEvent.FEED);
        imageDeleter.deleteAllAfterCommit(removed);

        FeedItemResponse item = mapper.toItem(post, mapper.userNames(List.of(userId)), userId, null, photos);
        return mapper.attachReactions(List.of(item), userId).get(0);
    }

    /** 포스트 삭제 — 작성자 본인만. */
    @Transactional
    public void deletePost(Long userId, Long postId) {
        FeedPost post = getCouplePost(userId, postId);
        if (!userId.equals(post.getAuthorId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 쓴 포스트만 삭제할 수 있습니다.");
        }
        /*
         * 사진 URL 은 행을 지우기 전에 모아 둔다 — feed_post_photos 는 CASCADE(V79)로 함께 사라지므로
         * 나중엔 알 길이 없고, 탈퇴 때의 Purger 도 행이 없으면 거두지 못한다(2026-09-08 점검 #7).
         * image_url(대표)과 photos[0] 은 같은 값이지만 Cloudinary 삭제는 멱등이라 걸러내지 않는다.
         */
        List<String> imageUrls = new ArrayList<>();
        if (post.getImageUrl() != null) {
            imageUrls.add(post.getImageUrl());
        }
        feedPostPhotoRepository.findByPostIdOrderByOrderNoAsc(postId)
                .forEach(photo -> imageUrls.add(photo.getUrl()));

        // 반응은 더 이상 FK CASCADE 로 지워지지 않는다 (V60 — 대상이 4개 테이블이라 FK 불가)
        feedReactionRepository.deleteByTargetTypeAndTargetId(FeedItemType.POST, postId);
        feedPostRepository.delete(post);
        coupleEventPublisher.publish(post.getCoupleId(), CoupleEvent.FEED);
        // 외부 삭제는 커밋 뒤 — 실패해도 DB 삭제를 되돌리지 않는다(RelationService 와 같은 규칙)
        imageDeleter.deleteAllAfterCommit(imageUrls);
    }

    /**
     * 이모지 반응 토글 (FEED-03) — 일상 포스트뿐 아니라 운동·식단·맛집 방문 카드에도 단다.
     *
     * <p>새로 달면 <b>기록의 주인</b>에게 푸시가 간다(내 기록에 내가 달면 조용히 넘어간다).
     * "기록을 상대가 봐주고 응원해주는 순간"이 이 앱의 존재 이유라, 반응 대상이
     * 타임라인에 보이는 카드 전부여야 그 루프가 닫힌다.
     */
    @Transactional
    public List<ReactionSummary> toggleReaction(Long userId, FeedItemType type, Long refId, String emoji) {
        ReactionTarget target = resolveTarget(userId, type, refId);
        var existing = feedReactionRepository
                .findByTargetTypeAndTargetIdAndUserIdAndEmoji(type, refId, userId, emoji);
        if (existing.isPresent()) {
            feedReactionRepository.delete(existing.get());
        } else {
            feedReactionRepository.save(FeedReaction.builder()
                    .targetType(type)
                    .targetId(refId)
                    .userId(userId)
                    .emoji(emoji)
                    .build());
            if (!userId.equals(target.ownerId())) {
                notificationService.notify(target.ownerId(), NotificationCategory.PARTNER,
                        target.pushTitle(),
                        mapper.userName(userId) + "님이 " + emoji + " 를 남겼어요", PushLinks.FEED);
            }
        }
        coupleEventPublisher.publish(target.coupleId(), CoupleEvent.FEED);
        return mapper.summarize(feedReactionRepository.findByTargetTypeAndTargetId(type, refId), userId);
    }

    /**
     * 반응 대상 검증 — <b>내 커플의 타임라인에 실제로 보이는 것</b>에만 반응할 수 있다.
     *
     * <p>id 만 받아 무조건 저장하면 남의 운동 기록 id 를 찍어 반응을 남길 수 있고,
     * 그 푸시가 모르는 사람에게 간다. 타입마다 소유 판정 규칙이 다르므로 여기 한 곳에 모은다.
     */
    private ReactionTarget resolveTarget(Long userId, FeedItemType type, Long refId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        return switch (type) {
            case POST -> {
                FeedPost post = getCouplePost(userId, refId);
                yield new ReactionTarget(post.getAuthorId(), couple.getId(), "일상에 반응이 달렸어요");
            }
            case WORKOUT -> {
                Workout w = workoutRepository.findById(refId)
                        .filter(x -> isCoupleMember(x.getUserId(), userId, partnerId))
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "운동 기록을 찾을 수 없습니다."));
                yield new ReactionTarget(w.getUserId(), couple.getId(), "운동 기록에 응원이 달렸어요 💪");
            }
            case MEAL -> {
                Meal m = mealRepository.findById(refId)
                        .filter(x -> isCoupleMember(x.getUserId(), userId, partnerId))
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "식단 기록을 찾을 수 없습니다."));
                yield new ReactionTarget(m.getUserId(), couple.getId(), "식단 기록에 응원이 달렸어요 🍽️");
            }
            case PLACE_VISIT -> {
                PlaceVisit v = placeVisitRepository.findById(refId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "방문 기록을 찾을 수 없습니다."));
                boolean ours = placeRepository.findById(v.getPlaceId())
                        .map(p -> couple.getId().equals(p.getCoupleId()))
                        .orElse(false);
                if (!ours) {
                    throw new BusinessException(ErrorCode.FORBIDDEN);
                }
                yield new ReactionTarget(v.getVisitedBy(), couple.getId(), "맛집 기록에 반응이 달렸어요 📍");
            }
            case CONTENT_LOG -> {
                ContentLog l = contentLogRepository.findById(refId)
                        .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "관람 기록을 찾을 수 없습니다."));
                boolean ours = contentRepository.findById(l.getContentId())
                        .map(c -> couple.getId().equals(c.getCoupleId()))
                        .orElse(false);
                if (!ours) {
                    throw new BusinessException(ErrorCode.FORBIDDEN);
                }
                yield new ReactionTarget(l.getLoggedBy(), couple.getId(), "콘텐츠 기록에 반응이 달렸어요 🎬");
            }
        };
    }

    private boolean isCoupleMember(Long ownerId, Long userId, Long partnerId) {
        return ownerId.equals(userId) || ownerId.equals(partnerId);
    }

    /** 반응 대상의 주인·소속 커플·푸시 제목 — resolveTarget 이 타입별 차이를 여기로 흡수한다. */
    private record ReactionTarget(Long ownerId, Long coupleId, String pushTitle) {
    }

    // ---- helpers ----

    /**
     * 럽바디 "○○님 오늘" — 상대가 오늘(KST) 혼자 남긴 식사를 피드 카드와 <b>같은 모양</b>으로 준다.
     *
     * <p>피드 매퍼({@link FeedItemMapper#toItem(Meal, Map, Long, String)})를 그대로 쓰는 이유: 상대 식사의 노출 수준을
     * 우리 탭 피드와 한 곳에서 맞추기 위해서다 — 칼로리는 싣지 않는다(매퍼 주석, 2026-09-13 결정 · 2026-10-02 재확인).
     * 반응도 피드와 같은 행이라 어디서 달아도 같다.
     *
     * <p>데이트 식단(같이 먹기)은 뺀다 — 내 몫이 이미 내 "오늘" 목록에 "데이트" 배지로 있어 같은 끼니가 두 번 보인다.
     * 커플이 아니면 빈 목록이다(럽바디는 혼자 써도 열리는 화면이라 예외를 던지지 않는다).
     */
    @Transactional(readOnly = true)
    public List<FeedItemResponse> partnerMealsToday(Long userId) {
        Relation couple = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst().orElse(null);
        Long partnerId = couple != null ? couple.partnerOf(userId) : null;
        if (partnerId == null) {
            return List.of();
        }
        List<Meal> meals = mealRepository.findByUserIdAndMealDateOrderByIdAsc(partnerId, KstClock.today())
                .stream().filter(m -> !m.isSharedMeal()).toList();
        if (meals.isEmpty()) {
            return List.of();
        }
        Map<Long, String> names = mapper.userNames(List.of(partnerId));
        Map<Long, VisitWithPlace> places = placeLinksOf(meals);
        List<FeedItemResponse> items = meals.stream()
                .map(m -> {
                    VisitWithPlace place = places.get(m.getId());
                    return mapper.toItem(m, names, userId, place != null ? place.getPlaceName() : null);
                })
                .toList();
        return mapper.attachReactions(items, userId);
    }

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
