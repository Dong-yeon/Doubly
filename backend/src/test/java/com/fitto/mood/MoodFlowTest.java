package com.fitto.mood;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MoodPack;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import com.fitto.coupleemoji.service.CoupleEmojiService;
import com.fitto.mood.dto.MoodEntry;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.dto.MoodResponse;
import com.fitto.mood.service.MoodService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Arrays;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 무드 상태 통합 플로우 — H2 기반. PLAN.md "무드 상태" 참고. */
@SpringBootTest
@ActiveProfiles("test")
class MoodFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    MoodService moodService;
    @Autowired
    CoupleEmojiRepository coupleEmojiRepository;
    @Autowired
    CoupleEmojiService coupleEmojiService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false), "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    @Test
    void 무드를_설정하면_상대가_바로_조회할_수_있다() {
        Long a = register("mood-a@fitto.com");
        Long b = register("mood-b@fitto.com");
        connectCouple(a, b);

        MoodResponse afterA = moodService.set(a, new MoodRequest("😊", null, null));
        assertThat(afterA.mine().emoji()).isEqualTo("😊");
        assertThat(afterA.partner()).isNull(); // 상대는 아직 설정 안 함

        MoodResponse fromB = moodService.current(b);
        assertThat(fromB.mine()).isNull();
        assertThat(fromB.partner().emoji()).isEqualTo("😊");
    }

    @Test
    void 짧은_메모를_함께_남길_수_있다() {
        Long a = register("mood-c@fitto.com");
        Long b = register("mood-d@fitto.com");
        connectCouple(a, b);

        MoodResponse response = moodService.set(a, new MoodRequest("😴", null, "야근 중"));
        assertThat(response.mine().message()).isEqualTo("야근 중");
    }

    /** 무드는 원장(로그) 방식 — 같은 날 여러 번 바꿔도 매번 새로 쌓이고, 최신 것만 보인다. */
    @Test
    void 하루에_여러_번_바꿀_수_있고_최신_것만_보인다() {
        Long a = register("mood-e@fitto.com");
        Long b = register("mood-f@fitto.com");
        connectCouple(a, b);

        moodService.set(a, new MoodRequest("😊", null, null));
        MoodResponse latest = moodService.set(a, new MoodRequest("😢", null, null));

        assertThat(latest.mine().emoji()).isEqualTo("😢");
        assertThat(moodService.current(a).mine().emoji()).isEqualTo("😢");
    }

    @Test
    void 커플이_아니면_무드를_쓸_수_없다() {
        Long solo = register("mood-g@fitto.com");

        assertThatThrownBy(() -> moodService.set(solo, new MoodRequest("😊", null, null)))
                .isInstanceOf(BusinessException.class);
    }

    // ---- 우리 이모지 무드 (V81, 설계 메모 §7 "2단계 — 무드 연동") ----

    private CoupleEmoji saveEmoji(Long relationId, Long createdBy, Long subject, CoupleEmojiEmotion emotion) {
        return coupleEmojiRepository.save(CoupleEmoji.builder()
                .relationId(relationId)
                .createdBy(createdBy)
                .subjectUserId(subject)
                .batchId(UUID.randomUUID().toString())
                .emotion(emotion)
                .imageUrl("https://res.cloudinary.com/demo/image/upload/emoji-" + emotion + ".png")
                .promptVersion("v4")
                .build());
    }

    /** 이미지 URL 이 함께 내려오고, emoji 는 클라이언트 값이 아니라 감정 대역으로 채워진다. */
    @Test
    void 우리_이모지로_무드를_걸_수_있다() {
        Long a = register("mood-h@fitto.com");
        Long b = register("mood-i@fitto.com");
        Long relationId = connectCouple(a, b);
        CoupleEmoji emoji = saveEmoji(relationId, b, a, CoupleEmojiEmotion.ANGRY);

        // emoji 를 엉뚱하게 보내도 서버가 감정에서 다시 채운다
        MoodResponse response = moodService.set(a, new MoodRequest("🤯", emoji.getId(), null));

        assertThat(response.mine().coupleEmojiId()).isEqualTo(emoji.getId());
        assertThat(response.mine().imageUrl()).isEqualTo(emoji.getImageUrl());
        assertThat(response.mine().emoji()).isEqualTo(CoupleEmojiEmotion.ANGRY.moodEmoji());

        // 상대 화면에서도 같은 이미지가 보인다
        assertThat(moodService.current(b).partner().imageUrl()).isEqualTo(emoji.getImageUrl());
    }

    /**
     * 무드 대역은 <b>기본 12종 안에서</b> 골라야 한다 — 확장팩(PRO) 이모지를 쓰면 무료 사용자가
     * 자기 우리 이모지를 무드로 걸 때 402 가 난다(CoupleEmojiEmotion.moodEmoji 주석).
     */
    @Test
    void 무드_대역은_전부_무료_이모지다() {
        assertThat(Arrays.stream(CoupleEmojiEmotion.values()).map(CoupleEmojiEmotion::moodEmoji))
                .noneMatch(MoodPack::isPremium);
    }

    /**
     * 핵심 프라이버시 동작(§9) — 상대가 "내 얼굴 그만 써" 하고 지우면 홈 배지도 내려가야 한다.
     * 무드 행은 원장이라 지우지 않고, 그리는 방식만 유니코드로 되돌아간다.
     */
    @Test
    void 숨긴_이모지는_유니코드로_되돌아간다() {
        Long a = register("mood-j@fitto.com");
        Long b = register("mood-k@fitto.com");
        Long relationId = connectCouple(a, b);
        CoupleEmoji emoji = saveEmoji(relationId, b, a, CoupleEmojiEmotion.SLEEPY);

        moodService.set(a, new MoodRequest(null, emoji.getId(), null));
        assertThat(moodService.current(a).mine().imageUrl()).isNotNull();

        // 얼굴 주인(a) 이 아니어도 관계 멤버면 지울 수 있다(§9)
        coupleEmojiService.delete(b, emoji.getId());

        MoodEntry after = moodService.current(a).mine();
        assertThat(after.imageUrl()).isNull();
        assertThat(after.emoji()).isEqualTo(CoupleEmojiEmotion.SLEEPY.moodEmoji());
    }

    @Test
    void 남의_관계_이모지는_무드로_걸_수_없다() {
        Long a = register("mood-l@fitto.com");
        Long b = register("mood-m@fitto.com");
        connectCouple(a, b);
        Long x = register("mood-n@fitto.com");
        Long y = register("mood-o@fitto.com");
        Long otherRelation = connectCouple(x, y);
        CoupleEmoji theirs = saveEmoji(otherRelation, x, y, CoupleEmojiEmotion.HAPPY);

        assertThatThrownBy(() -> moodService.set(a, new MoodRequest(null, theirs.getId(), null)))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.COUPLE_EMOJI_NOT_FOUND);
    }

    @Test
    void 이모지도_우리_이모지도_없으면_거절한다() {
        Long a = register("mood-p@fitto.com");
        Long b = register("mood-q@fitto.com");
        connectCouple(a, b);

        assertThatThrownBy(() -> moodService.set(a, new MoodRequest(null, null, "메모만")))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }
}
