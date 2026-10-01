package com.fitto.dataexport;

import java.util.List;

/**
 * 내보내기의 한 덩어리 = 테이블 하나 (docs/DATA_EXPORT_2026-10-01.md §2).
 *
 * <p><b>엔티티 DTO 를 따로 만들지 않고 행을 그대로 내보낸다.</b> 섹션이 25개를 넘는데 섹션마다
 * DTO 를 두면 컬럼이 늘 때마다 내보내기만 조용히 뒤처진다. "내 기록 전부"가 목적이라 스키마
 * 그대로가 가장 정직하다. 대신 {@code users} 처럼 비밀번호·소셜 id 가 섞인 테이블은
 * {@link #select} 로 <b>컬럼을 지정</b>한다 — {@code t.*} 는 내용 테이블에만 쓴다.
 *
 * <p>{@link #from} 은 별칭 {@code t} 가 내보낼 테이블인 FROM~WHERE 절이고, 관계 섹션은
 * {@code :rid}, 개인 섹션은 {@code :uid} 하나만 받는다. 요청에서 relationId 를 받지 않고
 * 토큰의 사용자로 정하므로 남의 관계를 지정할 길이 없다.
 *
 * <p>새 커플 콘텐츠 테이블을 만들면 여기도 한 줄 늘린다 — Purger 규칙(CLAUDE.md 4절)과 짝이다.
 */
public enum ExportSection {

    // ── 우리 둘 ─────────────────────────────────────────────
    COUPLE(Scope.COUPLE, "t.id, t.relation_name, t.anniversary_date, t.connected_at, t.background_image_url",
            "relations t WHERE t.id = :rid", List.of("background_image_url")),
    MEMBERS(Scope.COUPLE, "t.id, t.name, t.profile_image_url",
            "users t WHERE t.id IN (SELECT r.user_a_id FROM relations r WHERE r.id = :rid"
                    + " UNION SELECT r.user_b_id FROM relations r WHERE r.id = :rid)",
            List.of()),
    FEED_POSTS(Scope.COUPLE, "feed_posts t WHERE t.couple_id = :rid", List.of("image_url")),
    FEED_POST_PHOTOS(Scope.COUPLE,
            "feed_post_photos t JOIN feed_posts p ON p.id = t.post_id WHERE p.couple_id = :rid", List.of("url")),
    TRIPS(Scope.COUPLE, "trips t WHERE t.couple_id = :rid", List.of("cover_image_url")),
    TRIP_ITEMS(Scope.COUPLE, "trip_items t JOIN trips p ON p.id = t.trip_id WHERE p.couple_id = :rid", List.of()),
    TRIP_EXPENSES(Scope.COUPLE, "trip_expenses t JOIN trips p ON p.id = t.trip_id WHERE p.couple_id = :rid", List.of()),
    TRIP_CHECKLIST_ITEMS(Scope.COUPLE,
            "trip_checklist_items t JOIN trips p ON p.id = t.trip_id WHERE p.couple_id = :rid", List.of()),
    PLACES(Scope.COUPLE, "places t WHERE t.couple_id = :rid", List.of()),
    PLACE_VISITS(Scope.COUPLE,
            "place_visits t JOIN places p ON p.id = t.place_id WHERE p.couple_id = :rid", List.of("image_url")),
    PLACE_RATINGS(Scope.COUPLE,
            "place_ratings t JOIN places p ON p.id = t.place_id WHERE p.couple_id = :rid", List.of()),
    // poster_url 은 외부(작품 DB) 이미지라 파일로 받지 않는다 — 우리가 올린 것이 아니다.
    CONTENTS(Scope.COUPLE, "contents t WHERE t.couple_id = :rid", List.of()),
    CONTENT_LOGS(Scope.COUPLE,
            "content_logs t JOIN contents p ON p.id = t.content_id WHERE p.couple_id = :rid", List.of("image_url")),
    CONTENT_RATINGS(Scope.COUPLE,
            "content_ratings t JOIN contents p ON p.id = t.content_id WHERE p.couple_id = :rid", List.of()),
    /** 지운 메시지는 뺀다 — 화면에서도 "삭제된 메시지"로만 보인다. 음성은 content 안에 URL 이 있다. */
    CHAT_MESSAGES(Scope.COUPLE, "chat_messages t WHERE t.relation_id = :rid AND t.deleted_at IS NULL",
            List.of("image_url")),
    DAILY_ANSWERS(Scope.COUPLE, "daily_answers t WHERE t.couple_id = :rid", List.of()),
    COUPLE_EVENTS(Scope.COUPLE, "couple_events t WHERE t.couple_id = :rid", List.of()),
    MOOD_STATUSES(Scope.COUPLE, "mood_statuses t WHERE t.couple_id = :rid", List.of()),
    COUPLE_CHALLENGES(Scope.COUPLE, "couple_challenges t WHERE t.couple_id = :rid", List.of()),
    COUPLE_EMOJIS(Scope.COUPLE, "couple_emojis t WHERE t.relation_id = :rid AND t.deleted_at IS NULL",
            List.of("image_url")),
    WORKOUT_BOOSTERS(Scope.COUPLE, "workout_boosters t WHERE t.relation_id = :rid", List.of("audio_url")),

    // ── 나 ──────────────────────────────────────────────────
    PROFILE(Scope.PERSONAL, "t.id, t.email, t.name, t.birth_date, t.gender, t.height_cm, t.profile_image_url, t.created_at",
            "users t WHERE t.id = :uid", List.of("profile_image_url")),
    MEALS(Scope.PERSONAL, "meals t WHERE t.user_id = :uid", List.of("photo_url")),
    MEAL_ITEMS(Scope.PERSONAL, "meal_items t JOIN meals p ON p.id = t.meal_id WHERE p.user_id = :uid", List.of()),
    WORKOUTS(Scope.PERSONAL, "workouts t WHERE t.user_id = :uid", List.of("image_url")),
    WORKOUT_SETS(Scope.PERSONAL,
            "workout_sets t JOIN workouts p ON p.id = t.workout_id WHERE p.user_id = :uid", List.of()),
    WORKOUT_SET_ENTRIES(Scope.PERSONAL,
            "workout_set_entries t JOIN workout_sets s ON s.id = t.workout_set_id"
                    + " JOIN workouts p ON p.id = s.workout_id WHERE p.user_id = :uid", List.of()),
    BODY_METRICS(Scope.PERSONAL, "body_metrics t WHERE t.user_id = :uid", List.of("photo_url")),
    VOICE_CLIPS(Scope.PERSONAL, "voice_clips t WHERE t.user_id = :uid", List.of("audio_url")),
    WATER_LOGS(Scope.PERSONAL, "water_logs t WHERE t.user_id = :uid", List.of()),
    FASTING_SESSIONS(Scope.PERSONAL, "fasting_sessions t WHERE t.user_id = :uid", List.of());

    public enum Scope { COUPLE, PERSONAL }

    private final Scope scope;
    private final String select;
    private final String from;
    private final List<String> mediaColumns;

    ExportSection(Scope scope, String from, List<String> mediaColumns) {
        this(scope, "t.*", from, mediaColumns);
    }

    ExportSection(Scope scope, String select, String from, List<String> mediaColumns) {
        this.scope = scope;
        this.select = select;
        this.from = from;
        this.mediaColumns = mediaColumns;
    }

    public Scope scope() {
        return scope;
    }

    public String select() {
        return select;
    }

    public String from() {
        return from;
    }

    public List<String> mediaColumns() {
        return mediaColumns;
    }

    /** 앱·파일 이름에 쓰는 키 — {@code feed_posts.json} */
    public String key() {
        return name().toLowerCase();
    }
}
