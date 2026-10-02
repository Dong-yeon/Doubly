package com.fitto.common.upload;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 업로드 파일 URL 이 아직 어떤 행에서 쓰이고 있는지 — Cloudinary 자산을 지우기 직전의 마지막 확인.
 *
 * <p><b>한 파일을 여러 행이 함께 가리킨다.</b> 식단을 저장하고 "채팅에 공유"하면 채팅 MEAL_CARD 가
 * 식사 사진 URL 을 그대로 싣고, 데이트 식단은 상대 몫 행이 같은 URL 을 복사해 갖는다. 그런데 삭제
 * 경로(식사 삭제·피드 삭제·지난 기록 삭제·탈퇴)는 각자 "내가 지운 행의 URL"만 보고 자산을 지웠다 —
 * 식사를 지우면 채팅 카드 사진이, 탈퇴하면 상대가 채팅에 공유해 둔 상대 자신의 식사 사진이 깨졌다
 * (docs/LOVEBODY_REVIEW_2026-10-02.md §3 A-3).
 *
 * <p>삭제 경로마다 "누가 또 쓰는가"를 따지면 어긋나므로 {@link CloudinaryImageDeleter} 가 지우기
 * 직전에 여기를 한 번 지난다. 커밋 이후에 묻기 때문에 방금 지운 행은 이미 없고, <b>남은 행</b>만 걸린다.
 *
 * <p><b>파일 URL 을 담는 컬럼을 새로 만들면 {@link #COLUMNS} 에 추가한다.</b> 빠뜨리면 그 행은
 * 남아 있는데 파일만 지워지는 예전 문제가 그 테이블에서 되살아난다.
 */
@Component
public class StoredMediaReferences {

    /** 테이블 → 파일 URL 컬럼. 이미지와 오디오(음성 메시지·응원)를 함께 본다 — 지우는 쪽이 같다. */
    static final Map<String, List<String>> COLUMNS = Map.ofEntries(
            Map.entry("users", List.of("profile_image_url")),
            Map.entry("relations", List.of("background_image_url")),
            Map.entry("chat_messages", List.of("image_url")),
            Map.entry("scheduled_chat_messages", List.of("image_url")),
            Map.entry("meals", List.of("photo_url")),
            Map.entry("feed_posts", List.of("image_url")),
            Map.entry("feed_post_photos", List.of("url")),
            Map.entry("workouts", List.of("image_url")),
            Map.entry("body_metrics", List.of("photo_url")),
            Map.entry("place_visits", List.of("image_url")),
            Map.entry("content_logs", List.of("image_url")),
            Map.entry("contents", List.of("poster_url")),
            Map.entry("couple_emojis", List.of("image_url")),
            Map.entry("trips", List.of("cover_image_url")),
            Map.entry("voice_clips", List.of("audio_url")),
            Map.entry("workout_boosters", List.of("audio_url")));

    /** IN 절 한 번에 싣는 개수 — 관계 단위 삭제는 수백 건이 한꺼번에 온다 */
    private static final int CHUNK = 500;

    private final NamedParameterJdbcTemplate jdbc;

    public StoredMediaReferences(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * 주어진 URL 중 아직 어떤 행이 쓰고 있는 것.
     *
     * <p>컬럼을 {@code varchar} 로 맞춰 비교한다 — {@code meals.photo_url}·{@code audio_url} 은 TEXT 라
     * H2 에서는 CLOB 이 되어 IN 비교가 되지 않는다. URL 은 500자 안이라 잘릴 일이 없다.
     */
    public Set<String> stillReferenced(Collection<String> urls) {
        List<String> distinct = urls.stream().filter(u -> u != null && !u.isBlank()).distinct().toList();
        Set<String> referenced = new HashSet<>();
        if (distinct.isEmpty()) {
            return referenced;
        }
        for (int from = 0; from < distinct.size(); from += CHUNK) {
            List<String> chunk = distinct.subList(from, Math.min(distinct.size(), from + CHUNK));
            List<String> pending = new ArrayList<>(chunk);
            for (Map.Entry<String, List<String>> table : COLUMNS.entrySet()) {
                for (String column : table.getValue()) {
                    pending.removeAll(referenced);
                    if (pending.isEmpty()) break;
                    String expr = "cast(" + column + " as varchar(1000))";
                    referenced.addAll(jdbc.queryForList(
                            "select distinct " + expr + " from " + table.getKey() + " where " + expr + " in (:urls)",
                            Map.of("urls", pending), String.class));
                }
            }
        }
        return referenced;
    }
}
