package com.fitto.feed.service;

import com.fitto.diet.domain.Meal;
import com.fitto.feed.domain.FeedPost;
import com.fitto.feed.domain.FeedReaction;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.ReactionSummary;
import com.fitto.feed.repository.FeedReactionRepository;
import com.fitto.place.repository.PlaceVisitRepository.VisitWithPlace;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.domain.Workout;
import org.springframework.stereotype.Component;

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
    private final UserRepository userRepository;

    public FeedItemMapper(FeedReactionRepository feedReactionRepository,
                          UserRepository userRepository) {
        this.feedReactionRepository = feedReactionRepository;
        this.userRepository = userRepository;
    }

    // ---- 아이템 변환 ----

    public FeedItemResponse toItem(FeedPost p, Map<Long, String> names, Long viewerId,
                                   List<ReactionSummary> reactions) {
        return new FeedItemResponse(FeedItemType.POST, p.getId(), p.getAuthorId(),
                names.getOrDefault(p.getAuthorId(), "커플"), viewerId.equals(p.getAuthorId()),
                null, p.getContent(), p.getImageUrl(), p.getCreatedAt(), reactions);
    }

    public FeedItemResponse toItem(Workout w, Map<Long, String> names, Long viewerId) {
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

    /**
     * 식단 — 무엇을 먹었는지가 요약의 핵심이라 음식 항목 이름을 앞세운다
     * ("삼겹살 외 2개 · 820kcal"). 바로 위 운동 카드와 같은 타임라인에 나란히 서므로
     * 요약 형태를 맞춘다("러닝 외 3개 · 40분").
     *
     * <p>항목이 없는 기록(합계만 적었거나 항목 도입 이전)은 예전처럼 memo 로 보여준다.
     */
    public FeedItemResponse toItem(Meal m, Map<Long, String> names, Long viewerId) {
        StringBuilder summary = new StringBuilder();
        if (!m.getItems().isEmpty()) {
            summary.append(m.getItems().get(0).getName());
            if (m.getItems().size() > 1) {
                summary.append(" 외 ").append(m.getItems().size() - 1).append("개");
            }
        } else if (m.getMemo() != null && !m.getMemo().isBlank()) {
            summary.append(m.getMemo());
        }
        if (m.getCalories() != null) {
            if (summary.length() > 0) summary.append(" · ");
            summary.append(m.getCalories()).append("kcal");
        }
        String content = summary.length() > 0 ? summary.toString() : null;
        return new FeedItemResponse(FeedItemType.MEAL, m.getId(), m.getUserId(),
                names.getOrDefault(m.getUserId(), "커플"), viewerId.equals(m.getUserId()),
                m.getMealType().label() + " 식단 🍽️", content, m.getPhotoUrl(),
                m.getCreatedAt(), null);
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
                vp.getPlaceName() + " 방문 📍", content, v.getImageUrl(),
                byVisitedAt ? v.getVisitedAt().atStartOfDay() : v.getCreatedAt(), null);
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
                                .getOrDefault(i.refId(), List.of()), viewerId)))
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
