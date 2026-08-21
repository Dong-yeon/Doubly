package com.fitto.mood.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.mood.domain.MoodStatus;
import com.fitto.mood.dto.MoodEntry;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.dto.MoodResponse;
import com.fitto.mood.repository.MoodStatusRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * 무드 상태 — Obimy 벤치마킹. 이모지 하나로 "지금 상태"를 커플 화면 상단에 띄운다.
 * PLAN.md "무드 상태 (Mood Status — Obimy 벤치마킹)" 참고.
 *
 * <p>기본 세트는 <b>게이팅하지 않는다</b> — 원가가 없고 매일 여는 습관을 만드는 게
 * 목적인 기능이라 처음부터 전부 무료다({@code Feature.java} "체감가치 훅" 원칙과 동일).
 */
@Service
@Transactional(readOnly = true)
public class MoodService {

    private final MoodStatusRepository moodStatusRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public MoodService(MoodStatusRepository moodStatusRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher) {
        this.moodStatusRepository = moodStatusRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 나/상대 현재 무드 — 각각 관계 내 최신 1건. 아직 없으면 null. */
    public MoodResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);

        MoodEntry mine = moodStatusRepository
                .findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(couple.getId(), userId)
                .map(MoodEntry::from).orElse(null);
        MoodEntry partner = partnerId == null ? null : moodStatusRepository
                .findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(couple.getId(), partnerId)
                .map(MoodEntry::from).orElse(null);
        return new MoodResponse(mine, partner);
    }

    /** 무드 설정 — 새 행을 쌓는다(하루에 여러 번 바뀔 수 있다). */
    @Transactional
    public MoodResponse set(Long userId, MoodRequest req) {
        Relation couple = activeCouple(userId);

        moodStatusRepository.save(MoodStatus.builder()
                .coupleId(couple.getId())
                .userId(userId)
                .emoji(req.emoji())
                .message(blankToNull(req.message()))
                .build());

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, "지금 기분",
                    userName(userId) + "님 지금 기분: " + req.emoji(), Map.of("type", "mood"));
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.MOOD);
        return current(userId);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("상대방");
    }
}
