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
        exec("delete from feed_reactions where post_id in "
                + "(select p.id from feed_posts p where p.couple_id = :rid)", relationId);
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

        exec("delete from couple_challenges where couple_id = :rid", relationId);
        exec("delete from couple_events where couple_id = :rid", relationId);
        exec("delete from daily_answers where couple_id = :rid", relationId);
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
