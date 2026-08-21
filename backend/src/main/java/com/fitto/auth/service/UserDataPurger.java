package com.fitto.auth.service;

import com.fitto.relation.service.RelationRecordPurger;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * 회원 탈퇴 시 의존 데이터 정리 — AUTH-06.
 *
 * <p><b>왜 한 곳에 모았나</b>: users / relations 를 참조하는 외래키가 20개가 넘는다.
 * 서비스 곳곳에 정리 코드를 흩어놓으면 테이블이 추가될 때 빠뜨리기 쉽고,
 * 하나만 빠져도 탈퇴 전체가 외래키 위반으로 실패한다.
 *
 * <p>커플 콘텐츠 삭제는 "지난 기록 완전 삭제"와 대상이 같으므로
 * {@link RelationRecordPurger} 에 위임한다. 여기서는 <b>개인</b> 데이터만 다룬다.
 */
@Component
public class UserDataPurger {

    @PersistenceContext
    private EntityManager em;

    private final RelationRecordPurger relationRecordPurger;

    public UserDataPurger(RelationRecordPurger relationRecordPurger) {
        this.relationRecordPurger = relationRecordPurger;
    }

    /**
     * 사용자와 관련된 모든 의존 데이터를 삭제한다. users 행 자체는 호출자가 지운다.
     *
     * @return 커밋 이후 삭제해야 할 이미지 URL 목록
     */
    @Transactional
    public List<String> purgeFor(Long userId) {
        List<String> imageUrls = new ArrayList<>();

        // --- 1. 내가 속한 모든 관계의 커플 콘텐츠 (관계 행까지 삭제됨) ---
        for (Long relationId : myRelationIds(userId)) {
            imageUrls.addAll(relationRecordPurger.purge(relationId));
        }

        // --- 2. 관계와 무관한 개인 데이터 ---
        imageUrls.addAll(selectStrings(
                "select b.photo_url from body_metrics b "
                        + "where b.user_id = :uid and b.photo_url is not null", userId));
        imageUrls.addAll(selectStrings(
                "select m.photo_url from meals m "
                        + "where m.user_id = :uid and m.photo_url is not null", userId));

        /*
         * 내가 남긴 피드 반응 — feed_reactions.user_id 가 users 를 참조한다.
         * 대상(운동·식단·포스트·방문)별 정리는 관계 단위(RelationRecordPurger)에서 이미
         * 끝났지만, 관계가 하나도 없는 계정에도 이 행이 남아 있을 수 있어 한 번 더 훑는다
         * — 하나라도 남으면 users 삭제가 FK 위반으로 실패한다.
         */
        exec("delete from feed_reactions where user_id = :uid", userId);

        exec("delete from workout_sets where workout_id in "
                + "(select w.id from workouts w where w.user_id = :uid)", userId);
        exec("delete from workouts where user_id = :uid", userId);

        exec("delete from workout_routine_exercises where routine_id in "
                + "(select r.id from workout_routines r where r.user_id = :uid)", userId);
        exec("delete from workout_routines where user_id = :uid", userId);
        // workout_routines.program_id 가 여길 참조하므로 루틴을 먼저 지운 다음에 지운다.
        exec("delete from workout_programs where user_id = :uid", userId);

        exec("delete from streaks where user_id = :uid", userId);
        exec("delete from meals where user_id = :uid", userId);
        exec("delete from water_logs where user_id = :uid", userId);
        exec("delete from fasting_sessions where user_id = :uid", userId);
        exec("delete from favorite_foods where user_id = :uid", userId);
        exec("delete from body_metrics where user_id = :uid", userId);
        exec("delete from nutrition_goals where user_id = :uid", userId);
        exec("delete from device_tokens where user_id = :uid", userId);
        exec("delete from password_reset_tokens where user_id = :uid", userId);
        exec("delete from trainer_profiles where user_id = :uid", userId);
        exec("delete from voice_clips where user_id = :uid", userId);
        /*
         * 운동 부스터(V61) — 관계 단위 정리에서 이미 지워졌지만, 보낸 쪽/받은 쪽 users FK 가
         * 둘 다 걸려 있어 한 건이라도 남으면 탈퇴가 실패한다. 관계가 없는 계정(초대 대기 중
         * 끊긴 경우 등)까지 덮도록 한 번 더 훑는다 — feed_reactions 와 같은 이유.
         */
        exec("delete from workout_boosters where sender_id = :uid or receiver_id = :uid", userId);
        // 구독 이력 — users FK 를 물고 있어서 빠뜨리면 탈퇴 전체가 FK 위반으로 실패한다.
        // (환불·정산 근거는 스토어 콘솔에 남으므로 여기서 지워도 된다)
        exec("delete from subscriptions where user_id = :uid", userId);

        em.flush();
        em.clear();
        return imageUrls;
    }

    @SuppressWarnings("unchecked")
    private List<Long> myRelationIds(Long userId) {
        List<Number> ids = em.createNativeQuery(
                        "select r.id from relations r where r.user_a_id = :uid or r.user_b_id = :uid")
                .setParameter("uid", userId)
                .getResultList();
        return ids.stream().map(Number::longValue).toList();
    }

    @SuppressWarnings("unchecked")
    private List<String> selectStrings(String sql, Long userId) {
        return em.createNativeQuery(sql).setParameter("uid", userId).getResultList();
    }

    private void exec(String sql, Long userId) {
        em.createNativeQuery(sql).setParameter("uid", userId).executeUpdate();
    }
}
