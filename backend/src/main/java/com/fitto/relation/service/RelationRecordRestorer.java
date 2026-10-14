package com.fitto.relation.service;

import com.fitto.place.service.PlaceService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 지난 기록 불러오기 (REL-07) — {@link RelationRecordPurger} 의 반대편.
 *
 * <p>재회하면 <b>새 관계</b>가 만들어진다. 옛 콘텐츠는 여전히 옛 관계를 가리키고 있으므로,
 * 참조를 새 관계로 옮겨 다시 보이게 한다. 행을 복사하지 않고 소유 관계만 바꾸므로
 * 사진·메시지 원본은 그대로 유지된다.
 *
 * <p><b>왜 옛 관계를 되살리지 않는가</b>: 되살리면 재연결과 동시에 기록이 자동 복원된다.
 * 재연결에 동의한 것과 옛 기록을 다시 보는 데 동의한 것은 다르다. 새로 시작할 자유를
 *남겨두려면 기본값이 "빈 상태"여야 한다.
 */
@Component
public class RelationRecordRestorer {

    @PersistenceContext
    private EntityManager em;

    /**
     * 옛 관계의 콘텐츠를 새 관계로 옮기고, 빈 껍데기가 된 옛 관계를 제거한다.
     *
     * @return 옮겨진 콘텐츠 건수 (사용자에게 보여줄 요약용)
     */
    @Transactional
    public int restore(Long oldRelationId, Long newRelationId) {
        int moved = 0;
        moved += mergeDuplicatePlaces(oldRelationId, newRelationId);
        moved += move("places", "couple_id", oldRelationId, newRelationId);
        moved += move("feed_posts", "couple_id", oldRelationId, newRelationId);
        moved += move("trips", "couple_id", oldRelationId, newRelationId);
        moved += move("couple_challenges", "couple_id", oldRelationId, newRelationId);
        moved += move("couple_events", "couple_id", oldRelationId, newRelationId);

        /*
         * daily_answers 는 UNIQUE (couple_id, question_date, user_id) 다.
         * 재회 후 오늘 질문에 답한 뒤 복원하면 같은 (날짜, 사용자) 조합이 겹쳐 제약을 위반한다.
         * 새 관계의 답변을 우선하고, 충돌하는 옛 답변만 버린 뒤 나머지를 옮긴다.
         */
        em.createNativeQuery("""
                        delete from daily_answers old_a
                        where old_a.couple_id = :old
                          and exists (
                            select 1 from daily_answers new_a
                            where new_a.couple_id = :new
                              and new_a.question_date = old_a.question_date
                              and new_a.user_id = old_a.user_id)
                        """)
                .setParameter("old", oldRelationId).setParameter("new", newRelationId)
                .executeUpdate();
        moved += move("daily_answers", "couple_id", oldRelationId, newRelationId);
        moved += move("chat_messages", "relation_id", oldRelationId, newRelationId);
        /*
         * 채팅에 매달린 것들 — relation_id 를 따로 들고 있고 relations FK 가 ON DELETE CASCADE 라, 옮기지 않으면
         * 아래 "옛 관계 삭제"에서 <b>오류 없이 조용히</b> 사라진다. 메시지는 돌아왔는데 저장한 대화·공지만 빈 채였다
         * (docs/chat-current-state.md §7). 건수에는 넣지 않는다 — 메시지에 딸린 표시라 따로 세면 과장이다.
         *
         * 저장한 대화(V75): UNIQUE(message_id) 이고 메시지가 함께 옮겨지므로 겹칠 일이 없다.
         * 공지 고정(V77): 관계당 하나(UNIQUE(relation_id)). 재회 후 이미 새로 고정한 게 있으면 그쪽이 지금의
         * 공지라 남기고 옛 것은 버린다.
         * 예약 전송(V76)은 <b>옮기지 않는다</b> — 헤어지기 전에 걸어 둔 메시지가 재회 뒤 갑자기 나가면 안 된다.
         * 발송·취소된 행은 화면에 보이지 않는 이력이라 옛 관계와 함께 지워져도 잃는 것이 없다.
         */
        move("chat_message_bookmarks", "relation_id", oldRelationId, newRelationId);
        em.createNativeQuery("""
                        delete from chat_pinned_messages
                        where relation_id = :old
                          and exists (select 1 from chat_pinned_messages p where p.relation_id = :new)
                        """)
                .setParameter("old", oldRelationId).setParameter("new", newRelationId)
                .executeUpdate();
        move("chat_pinned_messages", "relation_id", oldRelationId, newRelationId);
        /*
         * 무드(V44)·우리 이모지(V80)도 relations FK 를 가진다 — 옮기지 않으면 아래 "옛 관계 삭제"가
         * FK 위반으로 실패해 복원 전체가 되돌아간다(2026-09-08 점검 #1: 무드를 한 번이라도 남긴 커플은
         * 재회 후 복원이 500 이었다). 우리 이모지는 커플 공용 자산(설계 §9)이라 되살리는 게 맞고,
         * 무드는 캘린더 원장이라 함께 따라간다. mood_statuses.couple_emoji_id 가 couple_emojis 를
         * 가리키므로(V81) 둘은 반드시 같이 옮긴다.
         */
        moved += move("mood_statuses", "couple_id", oldRelationId, newRelationId);
        moved += move("couple_emojis", "relation_id", oldRelationId, newRelationId);
        // 세트 메타(V138)도 relations FK 를 가진다 — 같은 이유로 함께 옮긴다. 남기면 옛 관계 삭제가 실패하고,
        // 옮겨지지 않은 세트는 다시 그리기 잔량을 잃는다(2026-10-13, docs/CURRENCY_EMOJI_2026-10-13.md §10 4-1)
        move("couple_emoji_sets", "relation_id", oldRelationId, newRelationId);
        // 운동 기록은 개인 소유지만 관계 참조는 되살려준다 (커플 통계에 다시 잡히도록)
        move("workouts", "relation_id", oldRelationId, newRelationId);

        /*
         * 아래도 전부 relations FK(ON DELETE 없음)다 — 하나라도 남으면 "옛 관계 삭제"가 FK 위반으로 실패해
         * 복원 전체가 500 으로 되돌아갔다(2026-10-14: 게임을 한 판이라도 연 커플이면 복원 불가였다).
         * 새 테이블이 relations 를 참조하면 Purger 와 함께 여기에도 넣는다.
         *
         * 커플 게임(V86): 끝낸·접은 판은 전적·스트릭의 원장이라 그대로 옮긴다. 옛 관계에서 <b>진행 중이던 판은 접고</b>
         * 옮긴다 — 서비스는 "종목당 진행 중인 판은 하나"를 전제로 최신 IN_PROGRESS 를 고르는데, 재회 뒤 새로 연
         * 판이 있으면 둘이 겹친다. 헤어지기 전에 멈춘 판이 재회 뒤 차례·재촉과 함께 되살아날 이유도 없다.
         * 접은 판은 사용자가 접은 판과 같다(기록·전적에 남지 않음, {@code GameExpiryService} 와 같은 규칙).
         * quarto_moves 등 수 이력은 couple_games 를 가리키므로 판을 따라간다.
         */
        em.createNativeQuery("update couple_games set status = 'ABANDONED' "
                        + "where couple_id = :old and status = 'IN_PROGRESS'")
                .setParameter("old", oldRelationId).executeUpdate();
        move("couple_games", "couple_id", oldRelationId, newRelationId);
        // 영화·공연 기록(V65)은 맛집과 같은 공유 기록이다 — 로그·평점은 contents 를 따라간다
        moved += move("contents", "couple_id", oldRelationId, newRelationId);
        // 통화 이력·식단 찌르기·선물함 — 이력이라 그대로 옮긴다. 식단 찌르기는 (sender, 날짜) UNIQUE 라 관계와 무관하게 겹치지 않는다
        move("call_sessions", "couple_id", oldRelationId, newRelationId);
        move("meal_nudges", "relation_id", oldRelationId, newRelationId);
        move("routine_gifts", "relation_id", oldRelationId, newRelationId);
        move("favorite_food_gifts", "relation_id", oldRelationId, newRelationId);
        /*
         * 운동 부스터(V61)는 상대의 다음 운동 시작 때 한 번 재생된다. 안 들은 채로 옮기면 헤어지기 전 녹음이 재회 뒤
         * 갑자기 재생된다(예약 전송을 옮기지 않는 것과 같은 이유). 지우지 않고 들은 것으로 바꾸는 이유는 audio_url 을
         * 나중에 Purger 가 거둬 가도록 행을 남기기 위해서다 — 여기서 지우면 업로드 파일이 고아가 된다.
         */
        em.createNativeQuery("update workout_boosters set played_at = current_timestamp "
                        + "where relation_id = :old and played_at is null")
                .setParameter("old", oldRelationId).executeUpdate();
        move("workout_boosters", "relation_id", oldRelationId, newRelationId);

        /*
         * 커플 스트릭은 옮기지 않고 버린다.
         * "연속 N일"은 끊김 없이 이어졌다는 뜻인데, 헤어져 있던 기간만큼 실제로 끊겼다.
         * 옛 기록을 그대로 가져오면 공백을 건너뛴 가짜 연속 기록이 된다.
         * (개인 스트릭은 user_id 기준이라 애초에 영향받지 않는다)
         */
        em.createNativeQuery("delete from streaks where relation_id = :old")
                .setParameter("old", oldRelationId).executeUpdate();

        // 기념일·배경은 관계 행에 있다 — 새 관계에 값이 없을 때만 승계한다
        em.createNativeQuery("""
                        update relations set
                          anniversary_date = coalesce(
                            anniversary_date, (select o.anniversary_date from relations o where o.id = :old)),
                          background_image_url = coalesce(
                            background_image_url, (select o.background_image_url from relations o where o.id = :old))
                        where id = :new
                        """)
                .setParameter("old", oldRelationId).setParameter("new", newRelationId)
                .executeUpdate();

        // 콘텐츠가 모두 빠져나갔으므로 옛 관계 행은 남길 이유가 없다 —
        // 새 관계는 재연결 시 자기 몫의 relation_members 를 이미 새로 갖고 있으므로 옛 것은 옮기지 않고 지운다
        em.createNativeQuery("delete from relation_members where relation_id = :old")
                .setParameter("old", oldRelationId).executeUpdate();
        em.createNativeQuery("delete from relations where id = :old")
                .setParameter("old", oldRelationId).executeUpdate();

        em.flush();
        em.clear();
        return moved;
    }

    /**
     * 옛 관계와 새 관계에 같은 카카오 장소가 각각 있으면 새 관계의 행 하나로 합친다.
     *
     * <p>places 는 {@code UNIQUE (couple_id, kakao_place_id)}(V117)다. 재회 뒤 같은 가게를 다시 담고 복원하면
     * 그냥 옮기는 update 가 이 제약을 위반해 복원 전체가 500 으로 되돌아갔다(2026-10-15).
     *
     * <p><b>왜 새 관계 쪽 행을 남기는가</b>: 재회 뒤 앱이 이미 그 id 로 카드·푸시 링크·여행 일정을 만들었다.
     * 옛 id 는 어차피 지금 화면 어디에도 보이지 않는다. 대신 옛 행에 매달린 것은 전부 새 행으로 옮겨 잃지 않는다.
     * <ul>
     *   <li>방문(place_visits)·메뉴판 사진·관람 장소(content_logs)·여행 일정(trip_items)·채팅 카드(chat_messages)
     *       — 행마다 독립된 기록이라 그대로 옮긴다. 방문 id 는 바뀌지 않으므로 방문에 단 피드 반응
     *       (feed_reactions, PLACE_VISIT)도 따라온다. place_visits 의 UNIQUE 는 meal_id·(visited_by, client_request_id)라
     *       장소와 무관해 겹치지 않는다.</li>
     *   <li>대표 평점(place_ratings) — UNIQUE (place_id, user_id). 사람마다 하나뿐이라 겹치면 <b>새 관계 쪽이 이긴다</b>
     *       (daily_answers·공지 고정과 같은 규칙: 재회 뒤에 남긴 것이 지금의 생각이다). 새 쪽에 없는 사람의 평점만 옮긴다.</li>
     *   <li>메뉴(place_menu_items) — 저장이 "통째로 바꾸기"(PUT)라 한 장소의 메뉴는 목록 하나다. 둘을 이어 붙이면 같은
     *       메뉴가 두 번 나온다. 새 쪽에 목록이 있으면 그것이 최신이라 옛 목록은 버리고, 없을 때만 옮긴다.
     *       메뉴 행에는 파일이 없어 버려도 고아가 생기지 않는다.</li>
     *   <li>여행 소속(places.trip_id) — 여행도 함께 옮겨지므로 새 행이 비어 있을 때만 옛 값을 잇는다.</li>
     *   <li>등급 — 합친 평점으로 {@link PlaceService#computeTier} 를 다시 매긴다. 등극 시각은 "0→양수로 처음 등극한
     *       시각"이라 두 행 중 이른 값을 남긴다. 복원은 사용자가 평가한 순간이 아니므로 등극 카드·푸시는 남기지 않는다.</li>
     * </ul>
     *
     * @return 합쳐진(옛 관계에서 사라진) 장소 수 — 사용자에게는 옮겨진 것과 같다
     */
    private int mergeDuplicatePlaces(Long oldRelationId, Long newRelationId) {
        @SuppressWarnings("unchecked")
        List<Object[]> pairs = em.createNativeQuery("""
                        select o.id, n.id from places o
                        join places n on n.kakao_place_id = o.kakao_place_id
                        where o.couple_id = :old and n.couple_id = :new and o.kakao_place_id is not null
                        """)
                .setParameter("old", oldRelationId).setParameter("new", newRelationId)
                .getResultList();
        for (Object[] pair : pairs) {
            mergePlace(((Number) pair[0]).longValue(), ((Number) pair[1]).longValue());
        }
        return pairs.size();
    }

    private void mergePlace(Long fromPlaceId, Long toPlaceId) {
        exec("""
                delete from place_ratings
                where place_id = :from
                  and user_id in (select r.user_id from place_ratings r where r.place_id = :to)
                """, fromPlaceId, toPlaceId);
        exec("""
                delete from place_menu_items
                where place_id = :from
                  and exists (select 1 from place_menu_items m where m.place_id = :to)
                """, fromPlaceId, toPlaceId);
        for (String table : List.of("place_ratings", "place_menu_items", "place_visits", "place_menu_photos",
                "content_logs", "trip_items", "chat_messages")) {
            exec("update " + table + " set place_id = :to where place_id = :from", fromPlaceId, toPlaceId);
        }

        @SuppressWarnings("unchecked")
        List<Number> ratings = em.createNativeQuery("select rating from place_ratings where place_id = :to")
                .setParameter("to", toPlaceId).getResultList();
        int tier = ratings.size() == 2
                ? PlaceService.computeTier(ratings.get(0).intValue(), ratings.get(1).intValue())
                : 0;
        if (tier == 0) {
            exec("""
                    update places set lovelichelin_tier = 0, lovelichelin_certified_at = null,
                      trip_id = coalesce(trip_id, (select o.trip_id from places o where o.id = :from))
                    where id = :to
                    """, fromPlaceId, toPlaceId);
        } else {
            em.createNativeQuery("""
                            update places set lovelichelin_tier = :tier,
                              lovelichelin_certified_at = coalesce(
                                (select min(p.lovelichelin_certified_at) from places p where p.id in (:from, :to)),
                                current_timestamp),
                              trip_id = coalesce(trip_id, (select o.trip_id from places o where o.id = :from))
                            where id = :to
                            """)
                    .setParameter("tier", tier).setParameter("from", fromPlaceId).setParameter("to", toPlaceId)
                    .executeUpdate();
        }
        exec("delete from places where id = :from", fromPlaceId, toPlaceId);
    }

    private void exec(String sql, Long fromPlaceId, Long toPlaceId) {
        var q = em.createNativeQuery(sql);
        if (sql.contains(":from")) q.setParameter("from", fromPlaceId);
        if (sql.contains(":to")) q.setParameter("to", toPlaceId);
        q.executeUpdate();
    }

    private int move(String table, String column, Long oldRelationId, Long newRelationId) {
        return em.createNativeQuery(
                        "update " + table + " set " + column + " = :new where " + column + " = :old")
                .setParameter("new", newRelationId).setParameter("old", oldRelationId)
                .executeUpdate();
    }
}
