package com.fitto.feed.service;

import com.fitto.content.domain.ContentLog;
import com.fitto.content.repository.ContentLogRepository.LogWithContent;
import com.fitto.diet.domain.Meal;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.domain.FeedPostPhoto;
import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.repository.FeedPostPhotoRepository;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitWithPlace;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.domain.Workout;
import com.fitto.workout.domain.WorkoutSet;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 피드 아이템 변환 — 원본 도메인(포스트·운동·식단·방문)을 {@link FeedItemResponse} 로 옮기고
 * 반응 요약을 붙인다.
 *
 * <p><b>왜 서비스에서 빼냈나</b>: {@link FeedService}(타임라인·사진첩)와
 * {@link MemoriesService}(추억 리마인드)가 같은 카드 형태를 내려준다. 변환을 복제하면
 * 두 화면의 카드가 조용히 어긋난다 — 별점 표기나 요약 문구처럼 사소한 것부터 벌어진다.
 */
@Component
public class FeedItemMapper {

    private final FeedReactionRepository feedReactionRepository;
    private final FeedPostPhotoRepository feedPostPhotoRepository;
    private final UserRepository userRepository;

    public FeedItemMapper(FeedReactionRepository feedReactionRepository,
                          FeedPostPhotoRepository feedPostPhotoRepository,
                          UserRepository userRepository) {
        this.feedReactionRepository = feedReactionRepository;
        this.feedPostPhotoRepository = feedPostPhotoRepository;
        this.userRepository = userRepository;
    }

    /**
     * 포스트 여러 건의 사진을 한 번에 배치 조회한다(N+1 방지) — {@link FeedService}(타임라인)와
     * {@link MemoriesService}(추억)가 똑같이 필요로 해서 여기 한 곳에 둔다.
     */
    public Map<Long, List<String>> photosByPostId(List<FeedPost> posts) {
        if (posts.isEmpty()) {
            return Map.of();
        }
        List<Long> postIds = posts.stream().map(FeedPost::getId).toList();
        Map<Long, List<String>> byPostId = new LinkedHashMap<>();
        for (FeedPostPhoto photo : feedPostPhotoRepository.findByPostIdInOrderByPostIdAscOrderNoAsc(postIds)) {
            byPostId.computeIfAbsent(photo.getPostId(), k -> new ArrayList<>()).add(photo.getUrl());
        }
        return byPostId;
    }

    // ---- 아이템 변환 ----

    public FeedItemResponse toItem(FeedPost p, Map<Long, String> names, Long viewerId,
                                   List<ReactionSummary> reactions, List<String> imageUrls) {
        return new FeedItemResponse(FeedItemType.POST, p.getId(), p.getAuthorId(),
                names.getOrDefault(p.getAuthorId(), "커플"), viewerId.equals(p.getAuthorId()),
                null, p.getContent(), p.getImageUrl(), p.getCreatedAt(), reactions, imageUrls, false);
    }

    /**
     * 운동 — <b>제목에 종목</b>, 부제에 분량(세트·볼륨·시간)을 둔다.
     *
     * <p>예전에는 제목이 늘 "운동 완료 💪" 였고 종목은 회색 한 줄로 밀려 있었다. 타임라인을
     * 내리면 같은 글자만 반복되고 정작 무엇을 했는지는 안 읽혔다. 카드 왼쪽 아이콘이 이미
     * 종류를 말하므로 제목의 이모지도 뺀다(아이콘·이모지·문구가 같은 말을 세 번 했다).
     */
    public FeedItemResponse toItem(Workout w, Map<Long, String> names, Long viewerId) {
        String title = w.getSets().isEmpty()
                ? "운동 완료"
                : w.getSets().get(0).getExerciseName()
                  + (w.getSets().size() > 1 ? " 외 " + (w.getSets().size() - 1) + "개" : "");
        return new FeedItemResponse(FeedItemType.WORKOUT, w.getId(), w.getUserId(),
                names.getOrDefault(w.getUserId(), "커플"), viewerId.equals(w.getUserId()),
                title, workoutSummary(w), null, w.getCreatedAt(), null, List.of(), false);
    }

    /**
     * 운동 분량 요약 — "4세트 · 2,400kg · 40분". 채울 게 없으면 {@code null}.
     *
     * <p>세트별 상세({@code WorkoutSetEntry})가 아니라 <b>요약 필드</b>(sets·reps·weightKg)로
     * 계산한다. 한 줄 요약이라 근사치로 충분하고, 피드 한 페이지(최대 20건)마다 entries 를
     * 훑으면 조회가 배로 늘어난다 — 정확한 볼륨이 필요한 곳은 {@code WorkoutService} 의
     * 종목별 히스토리다.
     */
    private static String workoutSummary(Workout w) {
        int setCount = 0;
        BigDecimal volume = BigDecimal.ZERO;
        for (WorkoutSet s : w.getSets()) {
            int count = s.getSets() == null ? 1 : s.getSets();
            setCount += count;
            if (s.getWeightKg() != null && s.getReps() != null) {
                volume = volume.add(s.getWeightKg().multiply(BigDecimal.valueOf((long) s.getReps() * count)));
            }
        }
        List<String> parts = new ArrayList<>();
        if (setCount > 0) parts.add(setCount + "세트");
        // 유산소만 한 날은 볼륨이 0 이다 — "0kg" 을 적으면 안 한 게 아니라 못 한 것처럼 읽힌다
        if (volume.signum() > 0) {
            parts.add(String.format("%,dkg", volume.setScale(0, RoundingMode.HALF_UP).longValue()));
        }
        if (w.getTotalDurationMin() != null) parts.add(w.getTotalDurationMin() + "분");
        return parts.isEmpty() ? null : String.join(" · ", parts);
    }

    /**
     * 식단 — <b>제목에 음식</b>, 부제에 끼니·장소를 둔다(운동 카드와 같은 규칙).
     *
     * <p><b>칼로리는 부제에 넣지 않는다</b> — 본문 주석 참고.
     *
     * <p>항목이 없는 기록(합계만 적었거나 항목 도입 이전)은 memo 를, 그마저 없으면
     * "아침 식단" 처럼 끼니를 제목으로 쓴다 — 제목이 빈 카드는 만들지 않는다.
     *
     * @param placeName 이 끼니에 연결된 장소 이름 (없으면 {@code null}) — 어디서 먹었는지는
     *                  "무엇을 먹었는지" 다음으로 궁금한 값인데, 지금까지 럽슐랭 탭으로
     *                  따로 찾아가야만 볼 수 있었다.
     */
    public FeedItemResponse toItem(Meal m, Map<Long, String> names, Long viewerId, String placeName) {
        String food = null;
        if (!m.getItems().isEmpty()) {
            food = m.getItems().get(0).getName()
                   + (m.getItems().size() > 1 ? " 외 " + (m.getItems().size() - 1) + "개" : "");
        } else if (m.getMemo() != null && !m.getMemo().isBlank()) {
            food = m.getMemo();
        }

        List<String> parts = new ArrayList<>();
        // 제목이 음식 이름을 가져갔으므로 끼니는 부제가 받는다 — 어느 끼니인지가 사라지면 안 된다
        if (food != null) parts.add(m.getMealType().label());
        /*
         * <b>칼로리는 싣지 않는다.</b> 피드는 기록하면 <b>자동으로</b> 커플 타임라인에 뜨는
         * 자리다 — 사용자가 공유를 고르는 순간이 없다. 그런데 먹은 칼로리는 상대가 매 끼니
         * 지켜보게 되면 응원이 아니라 감시로 읽히고, 그때 잃는 건 식단 기록 자체다.
         *
         * <p>상대에게 칼로리를 보내는 경로가 없어진 건 아니다 — 채팅 공유(MEAL_CARD)는 남는다.
         * 거기는 "공유하기"를 눌러야 나가므로 <b>사용자가 알고 고른다</b>. 홈의 상대 식단 칩도
         * 같은 원칙이다(PartnerTodayResponse 는 completed 불리언뿐).
         *
         * <p>2026-09-13 결정. 무엇을 먹었는지는 남기고 얼마나 먹었는지만 뺀다. 2026-09-14 의
         * 카드 재구성(제목=음식, 부제=끼니·칼로리·장소)은 이 결정을 모르는 채로 칼로리를
         * 부제에 다시 넣었고, 병합하면서 그 한 줄만 뺐다 — 나머지 구조는 그대로 쓴다.
         */
        if (placeName != null) parts.add("📍" + placeName);

        return new FeedItemResponse(FeedItemType.MEAL, m.getId(), m.getUserId(),
                names.getOrDefault(m.getUserId(), "커플"), viewerId.equals(m.getUserId()),
                food != null ? food : m.getMealType().label() + " 식단",
                parts.isEmpty() ? null : String.join(" · ", parts),
                m.getPhotoUrl(), m.getCreatedAt(), null, List.of(), m.isSharedMeal());
    }

    /**
     * 방문 기록 — 피드 타임라인용. {@code occurredAt} 은 {@code created_at}(등록 시각)이다.
     *
     * <p>추억 리마인드는 "방문한 날"이 기준이라 {@link #toItem(VisitWithPlace, Map, Long, boolean)}
     * 으로 {@code visited_at} 을 쓴다 — 통일하지 말 것.
     */
    public FeedItemResponse toItem(VisitWithPlace vp, Map<Long, String> names, Long viewerId) {
        return toItem(vp, names, viewerId, false);
    }

    /**
     * @param byVisitedAt {@code true} 면 {@code occurredAt} 을 방문일({@code visited_at}) 자정으로 둔다.
     *                    어제 다녀와서 오늘 등록한 방문은 "어제의 추억"이어야 한다.
     */
    public FeedItemResponse toItem(VisitWithPlace vp, Map<Long, String> names, Long viewerId,
                                   boolean byVisitedAt) {
        PlaceVisit v = vp.getVisit();
        String stars = v.getRating() != null ? "★".repeat(v.getRating()) : null;
        String content = v.getMemo() != null && !v.getMemo().isBlank()
                ? (stars != null ? stars + " " + v.getMemo() : v.getMemo())
                : stars;
        return new FeedItemResponse(FeedItemType.PLACE_VISIT, v.getId(), v.getVisitedBy(),
                names.getOrDefault(v.getVisitedBy(), "커플"), viewerId.equals(v.getVisitedBy()),
                // 카드 왼쪽 아이콘이 이미 '장소'를 말한다 — 제목의 📍은 같은 말의 반복이었다
                vp.getPlaceName() + " 방문", content, v.getImageUrl(),
                byVisitedAt ? v.getVisitedAt().atStartOfDay() : v.getCreatedAt(), null, List.of(), false);
    }

    /**
     * 관람 기록 — 피드 타임라인용. {@code occurredAt} 은 {@code created_at}(등록 시각)이다.
     * {@link #toItem(VisitWithPlace, Map, Long)} 과 완전히 같은 패턴 — 방문 대신 관람.
     */
    public FeedItemResponse toItem(LogWithContent lc, Map<Long, String> names, Long viewerId) {
        return toItem(lc, names, viewerId, false);
    }

    /**
     * @param byWatchedAt {@code true} 면 {@code occurredAt} 을 관람일({@code watched_at}) 자정으로 둔다.
     *                    어제 보고 오늘 등록한 관람은 "어제의 추억"이어야 한다.
     */
    public FeedItemResponse toItem(LogWithContent lc, Map<Long, String> names, Long viewerId,
                                   boolean byWatchedAt) {
        ContentLog l = lc.getLog();
        String stars = l.getRating() != null ? "★".repeat(l.getRating()) : null;
        String content = l.getMemo() != null && !l.getMemo().isBlank()
                ? (stars != null ? stars + " " + l.getMemo() : l.getMemo())
                : stars;
        return new FeedItemResponse(FeedItemType.CONTENT_LOG, l.getId(), l.getLoggedBy(),
                names.getOrDefault(l.getLoggedBy(), "커플"), viewerId.equals(l.getLoggedBy()),
                lc.getContentTitle() + " 관람", content, l.getImageUrl(),
                byWatchedAt ? l.getWatchedAt().atStartOfDay() : l.getCreatedAt(), null, List.of(), false);
    }

    // ---- 반응 ----

    /**
     * 모든 아이템에 반응 요약을 채워 넣는다 (타입별 일괄 조회).
     *
     * <p>예전에는 POST 만 채웠다. 운동·식단·맛집 카드에도 응원을 달 수 있게 되면서
     * 전 타입으로 넓혔다 — 반응이 하나도 없는 카드는 빈 목록을 받는다({@code null} 아님).
     * 화면이 "반응 기능이 있는 카드"와 "없는 카드"를 구분할 필요가 없어야 하기 때문이다.
     *
     * <p>쿼리는 페이지당 타입 수만큼(최대 4번)이다. id 목록을 합쳐 한 번에 부르면
     * 테이블마다 id 공간이 달라 서로 다른 카드의 반응이 섞인다.
     */
    public List<FeedItemResponse> attachReactions(List<FeedItemResponse> items, Long viewerId) {
        if (items.isEmpty()) {
            return items;
        }
        Map<FeedItemType, List<Long>> idsByType = new LinkedHashMap<>();
        for (FeedItemResponse i : items) {
            idsByType.computeIfAbsent(i.type(), k -> new ArrayList<>()).add(i.refId());
        }
        Map<FeedItemType, Map<Long, List<FeedReaction>>> byTypeAndId = new LinkedHashMap<>();
        idsByType.forEach((type, ids) -> {
            Map<Long, List<FeedReaction>> byId = new LinkedHashMap<>();
            for (FeedReaction r : feedReactionRepository.findByTargetTypeAndTargetIdIn(type, ids)) {
                byId.computeIfAbsent(r.getTargetId(), k -> new ArrayList<>()).add(r);
            }
            byTypeAndId.put(type, byId);
        });
        return items.stream()
                .map(i -> new FeedItemResponse(i.type(), i.refId(), i.userId(), i.userName(), i.mine(),
                        i.title(), i.content(), i.imageUrl(), i.occurredAt(),
                        summarize(byTypeAndId
                                .getOrDefault(i.type(), Map.of())
                                .getOrDefault(i.refId(), List.of()), viewerId),
                        i.imageUrls(), i.shared()))
                .toList();
    }

    public List<ReactionSummary> summarize(List<FeedReaction> reactions, Long viewerId) {
        Map<String, List<FeedReaction>> byEmoji = new LinkedHashMap<>();
        for (FeedReaction r : reactions) {
            byEmoji.computeIfAbsent(r.getEmoji(), k -> new ArrayList<>()).add(r);
        }
        return byEmoji.entrySet().stream()
                .map(e -> new ReactionSummary(e.getKey(), e.getValue().size(),
                        e.getValue().stream().anyMatch(r -> viewerId.equals(r.getUserId()))))
                .toList();
    }

    // ---- 이름 ----

    public Map<Long, String> userNames(List<Long> userIds) {
        Map<Long, String> names = new LinkedHashMap<>();
        for (User u : userRepository.findAllById(userIds)) {
            names.put(u.getId(), u.getName());
        }
        return names;
    }

    public String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
