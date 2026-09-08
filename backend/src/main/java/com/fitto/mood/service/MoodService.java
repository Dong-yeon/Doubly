package com.fitto.mood.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.chat.domain.MoodPack;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
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
    private final CoupleEmojiRepository coupleEmojiRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public MoodService(MoodStatusRepository moodStatusRepository,
                       CoupleEmojiRepository coupleEmojiRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       PlanGuard planGuard) {
        this.moodStatusRepository = moodStatusRepository;
        this.coupleEmojiRepository = coupleEmojiRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /** 나/상대 현재 무드 — 각각 관계 내 최신 1건. 아직 없으면 null. */
    public MoodResponse current(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);

        MoodEntry mine = moodStatusRepository
                .findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(couple.getId(), userId)
                .map(status -> withImage(status, couple.getId())).orElse(null);
        MoodEntry partner = partnerId == null ? null : moodStatusRepository
                .findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(couple.getId(), partnerId)
                .map(status -> withImage(status, couple.getId())).orElse(null);
        return new MoodResponse(mine, partner);
    }

    /**
     * 우리 이모지 무드라면 이미지 URL 을 붙인다(V81).
     *
     * <p><b>숨긴 이모지는 유니코드로 되돌린다</b> — {@code DeletedAtIsNull} 조건이 그 역할이다.
     * 상대가 "내 얼굴 그만 써" 하고 지웠는데 홈 배지로 계속 남아 있으면 설계 메모 §9 의 약속이
     * 깨진다. 무드 행은 그대로 두고(원장 방식이라 지우지 않는다) 그리는 방식만 바뀐다.
     */
    private MoodEntry withImage(MoodStatus status, Long relationId) {
        if (status.getCoupleEmojiId() == null) {
            return MoodEntry.from(status);
        }
        return coupleEmojiRepository
                .findByIdAndRelationIdAndDeletedAtIsNull(status.getCoupleEmojiId(), relationId)
                .map(emoji -> MoodEntry.of(status, emoji.getImageUrl()))
                .orElseGet(() -> MoodEntry.from(status));
    }

    /** 무드 설정 — 새 행을 쌓는다(하루에 여러 번 바뀔 수 있다). */
    @Transactional
    public MoodResponse set(Long userId, MoodRequest req) {
        Relation couple = activeCouple(userId);

        String emoji;
        Long coupleEmojiId = null;
        if (req.coupleEmojiId() != null) {
            // 우리 이모지 무드(V81) — 내 관계의, 숨기지 않은 것만. PRO 판정은 하지 않는다:
            // 만들 때 이미 AI_COUPLE_EMOJI 로 과금·게이팅했고, 커플 공용이라 무료인 상대도 걸 수 있어야 한다
            // (채팅 전송이 PRO 판정을 하지 않는 것과 같은 이유 — MessageType.COUPLE_EMOJI 주석).
            CoupleEmoji chosen = coupleEmojiRepository
                    .findByIdAndRelationIdAndDeletedAtIsNull(req.coupleEmojiId(), couple.getId())
                    .orElseThrow(() -> new BusinessException(ErrorCode.COUPLE_EMOJI_NOT_FOUND));
            coupleEmojiId = chosen.getId();
            // emoji 는 클라이언트 값을 믿지 않고 감정에서 채운다 — NOT NULL 이고 푸시가 그대로 읽는다.
            emoji = chosen.getEmotion().moodEmoji();
        } else {
            if (req.emoji() == null || req.emoji().isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "무드를 선택해주세요.");
            }
            emoji = req.emoji();
            if (MoodPack.isPremium(emoji)) {
                // 확장 무드팩은 PRO 전용 — 스티커와 같은 Feature 로 판정한다(둘 다 원가 0의 꾸미기).
                // 목록에 없는 이모지는 예전처럼 자유롭게 쓸 수 있다(MoodPack 주석 참고).
                planGuard.require(userId, Feature.PREMIUM_STICKER);
            }
        }

        moodStatusRepository.save(MoodStatus.builder()
                .coupleId(couple.getId())
                .userId(userId)
                .emoji(emoji)
                .coupleEmojiId(coupleEmojiId)
                .message(blankToNull(req.message()))
                .build());

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "지금 기분",
                    userName(userId) + "님 지금 기분: " + emoji, PushLinks.HOME);
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
