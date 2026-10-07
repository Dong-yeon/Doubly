package com.fitto.mood.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.chat.domain.StickerPacks;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.sticker.service.StickerService;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

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

    /**
     * 무드 푸시 간격 — 직전 무드 뒤로 이만큼 지나야 다시 푸시한다.
     *
     * <p>피커에서 몇 번 고쳐 고르면 고른 만큼 상대 폰이 울렸다(docs/daily-mood-current-state.md §8-8).
     * 무드는 "지금 상태"라 연달아 바꾸는 동안의 알림은 소음이고, 상대 홈은 실시간 이벤트로 이미
     * 최신을 보여 준다. 10분은 "기분이 정말 바뀌었다"로 읽힐 만한 간격이다.
     */
    static final Duration PUSH_QUIET = Duration.ofMinutes(10);

    private final MoodStatusRepository moodStatusRepository;
    private final CoupleEmojiRepository coupleEmojiRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final StickerService stickerService;

    public MoodService(MoodStatusRepository moodStatusRepository,
                       CoupleEmojiRepository coupleEmojiRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       StickerService stickerService) {
        this.moodStatusRepository = moodStatusRepository;
        this.coupleEmojiRepository = coupleEmojiRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.stickerService = stickerService;
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
        // 푸시에 실을 기분 — 대개 emoji 와 같고, 표정이 아닌 우리 이모지만 이름이다(CoupleEmojiEmotion.moodText)
        String moodText;
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
            moodText = chosen.getEmotion().moodText();
        } else {
            if (req.emoji() == null || req.emoji().isBlank()) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "무드를 선택해주세요.");
            }
            emoji = req.emoji();
            moodText = emoji;
            // 확장 무드팩은 유료 팩(MOOD_PREMIUM) — 스티커와 같은 경로로 판정한다(둘 다 원가 0의
            // 꾸미기라 Feature.PREMIUM_STICKER 를 공유하고, 이제 낱개로도 살 수 있다).
            // 목록에 없는 이모지는 예전처럼 자유롭게 쓸 수 있다(StickerPacks.ofMoodEmoji 주석).
            stickerService.requireUsable(userId, StickerPacks.ofMoodEmoji(emoji));
        }

        // 저장 전에 직전 무드를 본다 — 푸시 간격 판정은 원장 그대로(따로 "보낸 시각"을 두지 않는다)
        MoodStatus previous = moodStatusRepository
                .findTopByCoupleIdAndUserIdOrderByCreatedAtDescIdDesc(couple.getId(), userId)
                .orElse(null);
        String message = blankToNull(req.message());

        moodStatusRepository.save(MoodStatus.builder()
                .coupleId(couple.getId())
                .userId(userId)
                .emoji(emoji)
                .coupleEmojiId(coupleEmojiId)
                .message(message)
                .build());

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null && shouldPush(previous, message, LocalDateTime.now())) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "지금 기분",
                    pushBody(userName(userId), moodText, req.message()), PushLinks.HOME);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.MOOD);
        return current(userId);
    }

    /**
     * 이번 무드를 상대에게 푸시할까.
     *
     * <ul>
     *   <li>직전 무드가 없거나 {@link #PUSH_QUIET} 보다 오래됐으면 보낸다.</li>
     *   <li>간격 안이어도 <b>새 한마디</b>가 붙었으면 보낸다 — 직접 쳐 넣은 말은 전하려는 뜻이 분명하다.
     *       직전과 같은 한마디를 다시 고른 것(이모지만 바꾼 경우)은 새 말이 아니다.</li>
     * </ul>
     * 건너뛰어도 무드는 저장되고 MOOD 이벤트는 나간다 — 상대 홈은 그대로 최신이다.
     * 시각은 둘 다 JVM 기본 TZ 벽시계라(@CreatedDate 와 now()) 저장 TZ 와 무관하게 비교된다.
     */
    static boolean shouldPush(MoodStatus previous, String message, LocalDateTime now) {
        if (previous == null || previous.getCreatedAt() == null) {
            return true;
        }
        if (Duration.between(previous.getCreatedAt(), now).compareTo(PUSH_QUIET) >= 0) {
            return true;
        }
        return message != null && !Objects.equals(message, previous.getMessage());
    }

    /**
     * 무드 푸시 본문 — 한마디가 있으면 뒤에 따옴표로 붙인다. 예) {@code 보리님 지금 기분: 😴 “야근 중”}
     *
     * <p>예전엔 이모지만 보내서, 피커가 받은 "상대에게 한마디"(20자)가 상대의 알림에 실리지 않았다 —
     * 받는 사람이 앱을 열기 전에 보는 유일한 자리가 푸시다(docs/daily-mood-current-state.md §8-7).
     * 20자라 잘라낼 일은 없다(MoodRequest @Size).
     *
     * @param mood 이모지, 또는 표정이 아닌 우리 이모지면 그 이름(배고파) — {@code CoupleEmojiEmotion.moodText}
     */
    static String pushBody(String name, String mood, String message) {
        String body = name + "님 지금 기분: " + mood;
        String note = message == null ? null : message.strip();
        return note == null || note.isEmpty() ? body : body + " “" + note + "”";
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
