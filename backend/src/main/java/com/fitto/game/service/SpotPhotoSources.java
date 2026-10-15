package com.fitto.game.service;

import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.relation.domain.Relation;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 틀린그림찾기에 쓸 수 있는 사진 — docs/spot-diff-design_2026-10-14.md 1절 A·C.
 *
 * <p>사진에는 SHARED/PRIVATE 같은 공개 범위가 없다. 그래서 <b>사진첩({@code FeedService.photos})에 나오는 사진</b>을
 * "둘이 이미 같이 보는 사진 = SHARED"로 본다. 출처와 공개 조건은 사진첩 쿼리와 같다:
 * <ul>
 *   <li>POST — 일상 대표 사진 + 여러 장(V79) 전부</li>
 *   <li>PLACE_VISIT — 럽슐랭 방문. 식단에서 만든 방문({@code meal_id})은 같은 사진이라 뺀다</li>
 *   <li>MEAL — 두 사람 식단. 상대 몫 복제 행({@code created_by <> user_id})은 뺀다</li>
 *   <li>WORKOUT — {@code image_shared = true} 인 것만</li>
 * </ul>
 * 채팅 사진(스크린샷이 많다)과 하루 기록(비공개)은 쓰지 않는다.
 *
 * <p>같은 조건으로 "그 사진이 아직 공유 상태로 남아 있는가"도 본다({@link #stillShared}) — 퍼즐 만료의 근거다.
 * 사진 크기(짧은 변 1000px)는 DB 에 없어서 여기서는 거르지 못한다 — worker 가 본다.
 */
@Component
public class SpotPhotoSources {

    public record Candidate(String type, long id, String url, LocalDateTime createdAt) {
    }

    private final NamedParameterJdbcTemplate jdbc;

    public SpotPhotoSources(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 최근 사진부터 {@link SpotDiffRules#MAX_CANDIDATES} 장까지 — 같은 URL 은 한 번만, {@code exclude} 는 뺀다 */
    public List<Candidate> candidates(Relation couple, Set<String> exclude) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("rid", couple.getId())
                .addValue("members", members(couple))
                .addValue("lim", SpotDiffRules.MAX_CANDIDATES);
        List<Candidate> all = new ArrayList<>();
        all.addAll(query("""
                select 'POST' as t, p.id as id, cast(p.image_url as varchar(1000)) as url, p.created_at as at
                from feed_posts p where p.couple_id = :rid and p.image_url is not null
                order by p.created_at desc limit :lim
                """, p));
        all.addAll(query("""
                select 'POST' as t, p.id as id, cast(ph.url as varchar(1000)) as url, p.created_at as at
                from feed_post_photos ph join feed_posts p on p.id = ph.post_id
                where p.couple_id = :rid
                order by p.created_at desc limit :lim
                """, p));
        all.addAll(query("""
                select 'PLACE_VISIT' as t, v.id as id, cast(v.image_url as varchar(1000)) as url, v.created_at as at
                from place_visits v join places pl on pl.id = v.place_id
                where pl.couple_id = :rid and v.image_url is not null and v.meal_id is null
                order by v.created_at desc limit :lim
                """, p));
        all.addAll(query("""
                select 'MEAL' as t, m.id as id, cast(m.photo_url as varchar(1000)) as url, m.created_at as at
                from meals m
                where m.user_id in (:members) and m.photo_url is not null
                  and (m.created_by is null or m.created_by = m.user_id)
                order by m.created_at desc limit :lim
                """, p));
        all.addAll(query("""
                select 'WORKOUT' as t, w.id as id, cast(w.image_url as varchar(1000)) as url, w.created_at as at
                from workouts w
                where w.user_id in (:members) and w.image_url is not null and w.image_shared = true
                order by w.created_at desc limit :lim
                """, p));

        all.sort(Comparator.comparing(Candidate::createdAt, Comparator.nullsLast(Comparator.reverseOrder())));
        Map<String, Candidate> byUrl = new LinkedHashMap<>();
        for (Candidate c : all) {
            if (c.url() == null || c.url().isBlank() || exclude.contains(c.url())) continue;
            byUrl.putIfAbsent(c.url(), c);
            if (byUrl.size() >= SpotDiffRules.MAX_CANDIDATES) break;
        }
        return new ArrayList<>(byUrl.values());
    }

    /**
     * 퍼즐의 원본이 아직 같은 조건으로 공유돼 있는가 — 행이 지워졌거나, 사진이 바뀌었거나(URL 이 다르다),
     * 공유를 거뒀거나, 그 커플의 것이 아니게 됐으면 false.
     */
    public boolean stillShared(Relation couple, String type, Long id, String url) {
        if (type == null || id == null || url == null) return false;
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("rid", couple.getId())
                .addValue("members", members(couple))
                .addValue("id", id)
                .addValue("url", url);
        String sql = switch (type) {
            case "POST" -> """
                    select count(*) from feed_posts p
                    where p.id = :id and p.couple_id = :rid
                      and (cast(p.image_url as varchar(1000)) = :url
                           or exists (select 1 from feed_post_photos ph
                                      where ph.post_id = p.id and cast(ph.url as varchar(1000)) = :url))
                    """;
            case "PLACE_VISIT" -> """
                    select count(*) from place_visits v join places pl on pl.id = v.place_id
                    where v.id = :id and pl.couple_id = :rid and cast(v.image_url as varchar(1000)) = :url
                    """;
            case "MEAL" -> """
                    select count(*) from meals m
                    where m.id = :id and m.user_id in (:members) and cast(m.photo_url as varchar(1000)) = :url
                    """;
            case "WORKOUT" -> """
                    select count(*) from workouts w
                    where w.id = :id and w.user_id in (:members) and w.image_shared = true
                      and cast(w.image_url as varchar(1000)) = :url
                    """;
            default -> null;
        };
        if (sql == null) return false;
        Long n = jdbc.queryForObject(sql, p, Long.class);
        return n != null && n > 0;
    }

    private List<Candidate> query(String sql, MapSqlParameterSource p) {
        return jdbc.query(sql, p, (rs, i) -> {
            Timestamp at = rs.getTimestamp("at");
            return new Candidate(rs.getString("t"), rs.getLong("id"), rs.getString("url"),
                    at == null ? null : at.toLocalDateTime());
        });
    }

    private static Collection<Long> members(Relation couple) {
        List<Long> ids = new ArrayList<>();
        if (couple.getUserAId() != null) ids.add(couple.getUserAId());
        if (couple.getUserBId() != null) ids.add(couple.getUserBId());
        return ids;
    }
}
