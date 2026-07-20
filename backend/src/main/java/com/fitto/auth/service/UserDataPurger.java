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

        exec("delete from workout_sets where workout_id in "
                + "(select w.id from workouts w where w.user_id = :uid)", userId);
        exec("delete from workouts where user_id = :uid", userId);

        exec("delete from workout_routine_exercises where routine_id in "
                + "(select r.id from workout_routines r where r.user_id = :uid)", userId);
        exec("delete from workout_routines where user_id = :uid", userId);

        exec("delete from streaks where user_id = :uid", userId);
        exec("delete from meals where user_id = :uid", userId);
        exec("delete from favorite_foods where user_id = :uid", userId);
        exec("delete from body_metrics where user_id = :uid", userId);
        exec("delete from nutrition_goals where user_id = :uid", userId);
        exec("delete from device_tokens where user_id = :uid", userId);
        exec("delete from password_reset_tokens where user_id = :uid", userId);
        exec("delete from trainer_profiles where user_id = :uid", userId);

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
