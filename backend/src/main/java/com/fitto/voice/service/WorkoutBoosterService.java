package com.fitto.voice.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.voice.domain.WorkoutBooster;
import com.fitto.voice.dto.SendBoosterRequest;
import com.fitto.voice.dto.WorkoutBoosterResponse;
import com.fitto.voice.repository.WorkoutBoosterRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 운동 부스터 — 애인이 즉석 녹음해 보내면 상대의 <b>다음 세션 시작 때 한 번</b> 재생되고 소멸한다.
 *
 * <p><b>왜 상설 클립과 따로 두는가</b>: 기존 음성 응원({@code VoiceClipService})은 문구별
 * 상설 클립이라 언제 들을지 앱이 미리 안다. 부스터는 "지금 이 순간을 위해 보낸 한 마디"라
 * 쌓였다가 하나씩 소비되는 모델이 필요하다 — 교체 모델로는 표현되지 않는다.
 *
 * <p>PRO 전용에 주간 한도가 있다({@link Feature#WORKOUT_BOOSTER}). 원가가 0인 스티커와 달리
 * 녹음 파일은 Cloudinary 저장 비용이 실제로 나가므로 PRO 도 무제한이 아니다.
 */
@Service
@Transactional(readOnly = true)
public class WorkoutBoosterService {

    private final WorkoutBoosterRepository boosterRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;

    public WorkoutBoosterService(WorkoutBoosterRepository boosterRepository,
                                 RelationRepository relationRepository,
                                 UserRepository userRepository,
                                 PlanGuard planGuard,
                                 NotificationService notificationService) {
        this.boosterRepository = boosterRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
    }

    /** 애인에게 부스터 보내기 — 커플이 연결돼 있어야 한다. */
    @Transactional
    public WorkoutBoosterResponse send(Long userId, SendBoosterRequest request) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                    "커플 연결 후 보낼 수 있어요.");
        }
        planGuard.consume(userId, Feature.WORKOUT_BOOSTER);

        WorkoutBooster booster = boosterRepository.save(WorkoutBooster.builder()
                .relationId(couple.getId())
                .senderId(userId)
                .receiverId(partnerId)
                .audioUrl(request.audioUrl().trim())
                .message(blankToNull(request.message()))
                .build());

        String senderName = userName(userId);
        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                "부스터가 도착했어요 🎤",
                senderName + "님의 응원이 다음 운동을 시작할 때 재생돼요.",
                PushLinks.WORKOUT);
        return WorkoutBoosterResponse.of(booster, senderName);
    }

    /**
     * 대기 중인 부스터 하나 — 세션 시작 때 한 번 조회한다. 없으면 {@code null}.
     *
     * <p>여기서 소비하지 않는다. 조회 시점에 소비 처리하면 네트워크가 끊기거나 재생이
     * 실패했을 때 응원이 들리지도 않은 채 사라진다. 실제 재생 뒤 {@link #markPlayed} 로 확정한다.
     */
    public WorkoutBoosterResponse pending(Long userId) {
        return boosterRepository.findFirstByReceiverIdAndPlayedAtIsNullOrderByIdAsc(userId)
                .map(b -> WorkoutBoosterResponse.of(b, userName(b.getSenderId())))
                .orElse(null);
    }

    /** 재생 완료 — 중복 호출은 조용히 무시한다(재시도·중복 탭에 안전). */
    @Transactional
    public void markPlayed(Long userId, Long boosterId) {
        WorkoutBooster booster = boosterRepository.findById(boosterId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "부스터를 찾을 수 없어요."));
        if (!booster.getReceiverId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        booster.markPlayed(LocalDateTime.now());
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
