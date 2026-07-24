package com.fitto.relation.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

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
        // 운동 기록은 개인 소유지만 관계 참조는 되살려준다 (커플 통계에 다시 잡히도록)
        move("workouts", "relation_id", oldRelationId, newRelationId);

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

        // 콘텐츠가 모두 빠져나갔으므로 옛 관계 행은 남길 이유가 없다
        em.createNativeQuery("delete from relations where id = :old")
                .setParameter("old", oldRelationId).executeUpdate();

        em.flush();
        em.clear();
        return moved;
    }

    private int move(String table, String column, Long oldRelationId, Long newRelationId) {
        return em.createNativeQuery(
                        "update " + table + " set " + column + " = :new where " + column + " = :old")
                .setParameter("new", newRelationId).setParameter("old", oldRelationId)
                .executeUpdate();
    }
}
