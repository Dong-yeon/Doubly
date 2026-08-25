package com.fitto.relation.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 관계에 속한 커플 콘텐츠 삭제 — 기록 완전 삭제(AUTH-10) / 회원 탈퇴(AUTH-06) 공용.
 *
 * <p>탈퇴와 "지난 기록 삭제"는 지워야 할 커플 콘텐츠가 동일하다. 두 곳에 각각 구현하면
 * 테이블이 추가될 때 한쪽만 갱신되어 어긋나므로, 관계 단위 삭제는 여기 한 곳에만 둔다.
 *
 * <p><b>이미지는 여기서 지우지 않는다</b>: 외부 API 호출이라 트랜잭션 안에서 하면
 * 롤백해도 이미 지워진 파일을 되돌릴 수 없고, 호출 실패가 DB 삭제까지 되돌린다.
 * 대신 삭제할 이미지 URL 을 <b>반환</b>하고, 커밋 이후에 지우는 것은 호출자 책임이다.
 */
@Component
public class RelationRecordPurger {

    /**
     * 관계의 두 사람 — {@code user_b_id} 가 아직 NULL 인 관계(초대 대기)에서도 안전하다
     * (SQL 의 {@code IN} 은 NULL 과 매칭되지 않는다).
     */
    private static final String MEMBER_IDS =
            "(select r.user_a_id from relations r where r.id = :rid"
                    + " union select r.user_b_id from relations r where r.id = :rid)";

    @PersistenceContext
    private EntityManager em;

    /**
     * 관계의 모든 콘텐츠와 관계 행 자체를 삭제한다.
     *
     * @return 함께 지워야 할 이미지 URL 목록 (커밋 이후 호출자가 삭제)
     */
    @Transactional
    public List<String> purge(Long relationId) {
        List<String> imageUrls = collectImageUrls(relationId);

        // --- 자식 → 부모 순서. 바꾸면 외래키 위반이 난다 ---
        /*
         * 피드 반응은 대상이 4종(포스트·운동·식단·방문)이라 FK 를 걸 수 없다(V60).
         * FK 가 없으니 DB 가 대신 지워주지도 않는다 — 커플의 콘텐츠에 달린 반응을
         * 여기서 전부 명시적으로 거둔다. 운동·식단은 관계가 끝나도 <b>개인 기록으로 남지만</b>
         * 그 카드에 달렸던 상대의 반응은 커플 피드에서만 보이던 것이므로 함께 지운다.
         */
        exec("delete from feed_reactions where target_type = 'POST' and target_id in "
                + "(select p.id from feed_posts p where p.couple_id = :rid)", relationId);
        exec("delete from feed_reactions where target_type = 'PLACE_VISIT' and target_id in "
                + "(select v.id from place_visits v where v.place_id in "
                + "(select p.id from places p where p.couple_id = :rid))", relationId);
        exec("delete from feed_reactions where target_type = 'CONTENT_LOG' and target_id in "
                + "(select l.id from content_logs l where l.content_id in "
                + "(select c.id from contents c where c.couple_id = :rid))", relationId);
        exec("delete from feed_reactions where target_type = 'WORKOUT' and target_id in "
                + "(select w.id from workouts w where w.user_id in " + MEMBER_IDS + ")", relationId);
        exec("delete from feed_reactions where target_type = 'MEAL' and target_id in "
                + "(select m.id from meals m where m.user_id in " + MEMBER_IDS + ")", relationId);
        // feed_posts.trip_id 가 trips 를 참조하므로 피드를 먼저 지운다
        exec("delete from feed_posts where couple_id = :rid", relationId);

        exec("delete from trip_expenses where trip_id in "
                + "(select t.id from trips t where t.couple_id = :rid)", relationId);
        exec("delete from trip_checklist_items where trip_id in "
                + "(select t.id from trips t where t.couple_id = :rid)", relationId);
        exec("delete from trip_items where trip_id in "
                + "(select t.id from trips t where t.couple_id = :rid)", relationId);
        exec("delete from trips where couple_id = :rid", relationId);

        exec("delete from place_visits where place_id in "
                + "(select p.id from places p where p.couple_id = :rid)", relationId);
        exec("delete from places where couple_id = :rid", relationId);

        // 콘텐츠(영화·공연·드라마) — places 와 같은 모양(V65)
        exec("delete from content_logs where content_id in "
                + "(select c.id from contents c where c.couple_id = :rid)", relationId);
        exec("delete from content_ratings where content_id in "
                + "(select c.id from contents c where c.couple_id = :rid)", relationId);
        exec("delete from contents where couple_id = :rid", relationId);

        exec("delete from couple_challenges where couple_id = :rid", relationId);
        exec("delete from couple_events where couple_id = :rid", relationId);
        exec("delete from daily_answers where couple_id = :rid", relationId);
        exec("delete from mood_statuses where couple_id = :rid", relationId);
        exec("delete from call_sessions where couple_id = :rid", relationId);
        // 운동 부스터(V61) — relations/users 를 함께 참조하므로 관계와 함께 지운다
        exec("delete from workout_boosters where relation_id = :rid", relationId);
        // routine_gifts.snapshot_routine_id/resulting_routine_id 가 workout_routines 를
        // 참조하므로, 그 루틴들이 UserDataPurger 에서 지워지기 전인 여기서 먼저 지운다.
        exec("delete from routine_gifts where relation_id = :rid", relationId);
        // favorite_food_gifts.resulting_favorite_food_id 가 favorite_foods 를 참조하므로
        // 마찬가지로 favorite_foods 삭제(UserDataPurger)보다 먼저 지운다.
        // favorite_food_gift_items 는 gift_id ON DELETE CASCADE 라 함께 지워진다.
        exec("delete from favorite_food_gifts where relation_id = :rid", relationId);
        // 리액션·답장이 chat_messages 를 참조하므로 자식부터 지운다
        exec("delete from chat_message_reactions where message_id in "
                + "(select m.id from chat_messages m where m.relation_id = :rid)", relationId);
        // 같은 방 안에서 서로를 인용(reply_to_id)하므로 참조를 먼저 끊는다
        exec("update chat_messages set reply_to_id = null where relation_id = :rid", relationId);
        exec("delete from chat_messages where relation_id = :rid", relationId);
        exec("delete from trainer_routines where relation_id = :rid", relationId);
        exec("delete from streaks where relation_id = :rid", relationId);

        // 운동 기록은 개인 소유다 — 삭제하지 않고 관계 참조만 끊는다
        exec("update workouts set relation_id = null where relation_id = :rid", relationId);

        exec("delete from relation_members where relation_id = :rid", relationId);

        exec("delete from relations where id = :rid", relationId);

        em.flush();
        em.clear();
        return imageUrls;
    }

    /** 삭제 전에 이미지 URL 을 모아둔다 — 행이 사라진 뒤에는 조회할 수 없다. */
    private List<String> collectImageUrls(Long relationId) {
        List<String> urls = new ArrayList<>();
        urls.addAll(select("select p.image_url from feed_posts p "
                + "where p.couple_id = :rid and p.image_url is not null", relationId));
        urls.addAll(select("select v.image_url from place_visits v "
                + "where v.image_url is not null and v.place_id in "
                + "(select p.id from places p where p.couple_id = :rid)", relationId));
        urls.addAll(select("select l.image_url from content_logs l "
                + "where l.image_url is not null and l.content_id in "
                + "(select c.id from contents c where c.couple_id = :rid)", relationId));
        urls.addAll(select("select t.cover_image_url from trips t "
                + "where t.couple_id = :rid and t.cover_image_url is not null", relationId));
        urls.addAll(select("select m.image_url from chat_messages m "
                + "where m.relation_id = :rid and m.image_url is not null", relationId));
        urls.addAll(select("select r.background_image_url from relations r "
                + "where r.id = :rid and r.background_image_url is not null", relationId));
        return urls;
    }

    @SuppressWarnings("unchecked")
    private List<String> select(String sql, Long relationId) {
        return em.createNativeQuery(sql).setParameter("rid", relationId).getResultList();
    }

    private void exec(String sql, Long relationId) {
        em.createNativeQuery(sql).setParameter("rid", relationId).executeUpdate();
    }
}
