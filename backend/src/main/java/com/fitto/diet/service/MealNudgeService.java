package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.MealNudge;
import com.fitto.diet.repository.MealNudgeRepository;
import com.fitto.diet.repository.MealRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 식단 찌르기 — 상대가 오늘 식사를 안 남겼을 때 "뭐 먹었어?"를 한 번 보낸다.
 * docs/lovebody-direction_2026-10-02.md 2순위, LOVEBODY_REVIEW_2026-10-02.md §4.
 *
 * <p><b>터치(POKE)에 얹지 않는다</b> — 터치는 채팅 메시지라 대화방에 재촉이 쌓이고, 맥락이 없고("[콕 찌르기]"),
 * 쿨다운도 없다. 게임 찌르기({@code GameNudgeService})와 같은 모양으로 따로 둔다: 맥락 있는 문구 + 럽바디 링크,
 * 하루 한 번, PARTNER 카테고리(받는 쪽이 따로 끌 수 있다).
 *
 * <p><b>톤</b>: 식단 재촉은 감시로 읽히기 쉽다. 그래서 상대가 이미 남겼으면 보내지 않고(물어볼 이유가 없다),
 * 밤에는 보내지 않으며, 문구는 "기다려요"다 — 무엇을 먹으라는 말이 아니라 궁금하다는 말.
 */
@Service
public class MealNudgeService {

    /** 보낼 수 있는 시간(KST, [FROM, UNTIL)) — 아침 식사를 묻는 8시는 열고, 잘 시간인 22시부터는 닫는다 */
    static final int FROM_HOUR = 8;
    static final int UNTIL_HOUR = 22;

    private final MealNudgeRepository nudges;
    private final MealRepository meals;
    private final RelationRepository relations;
    private final UserRepository users;
    private final NotificationService notifications;

    public MealNudgeService(MealNudgeRepository nudges, MealRepository meals, RelationRepository relations,
                            UserRepository users, NotificationService notifications) {
        this.nudges = nudges;
        this.meals = meals;
        this.relations = relations;
        this.users = users;
        this.notifications = notifications;
    }

    @Transactional
    public void nudge(Long userId) {
        nudgeAt(userId, LocalDateTime.now(KstClock.ZONE));
    }

    /**
     * 시각을 받는 본체 — 시간 창 판정을 테스트가 고정된 시각으로 검증할 수 있게 나눴다.
     *
     * @param nowKst 지금(KST)
     * @throws BusinessException 커플 아님 · 밤 · 상대가 이미 남김 · 오늘 이미 물어봄
     */
    @Transactional
    public void nudgeAt(Long userId, LocalDateTime nowKst) {
        Relation couple = relations
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND, "커플 연결 후 쓸 수 있어요."));
        Long partnerId = couple.partnerOf(userId);
        if (partnerId == null) throw new BusinessException(ErrorCode.RELATION_NOT_FOUND);

        int hour = nowKst.getHour();
        if (hour < FROM_HOUR || hour >= UNTIL_HOUR) {
            throw new BusinessException(ErrorCode.MEAL_NUDGE_QUIET_HOURS);
        }
        LocalDate today = nowKst.toLocalDate();
        if (meals.existsByUserIdAndMealDate(partnerId, today)) {
            throw new BusinessException(ErrorCode.MEAL_NUDGE_ALREADY_RECORDED);
        }
        if (nudges.existsBySenderIdAndNudgeDate(userId, today)) {
            throw new BusinessException(ErrorCode.MEAL_NUDGE_TOO_SOON);
        }
        try {
            nudges.saveAndFlush(MealNudge.builder()
                    .relationId(couple.getId()).senderId(userId).receiverId(partnerId).nudgeDate(today)
                    .build());
        } catch (DataIntegrityViolationException e) {
            // 연타가 사전 조회를 둘 다 통과한 경우 — (sender_id, nudge_date) 유니크가 두 번째를 막았다(V120)
            throw new BusinessException(ErrorCode.MEAL_NUDGE_TOO_SOON);
        }

        String name = users.findById(userId).map(User::getName).orElse("커플");
        notifications.notify(partnerId, NotificationCategory.PARTNER,
                "뭐 먹었어? 🍽️",
                name + "님이 오늘 식단을 기다려요.",
                PushLinks.DIET);
    }

    /** 오늘 이미 물어봤는지 — 앱이 버튼 대신 "오늘 물어봤어요"를 보여준다 */
    @Transactional(readOnly = true)
    public boolean nudgedToday(Long userId) {
        return nudges.existsBySenderIdAndNudgeDate(userId, KstClock.today());
    }
}
