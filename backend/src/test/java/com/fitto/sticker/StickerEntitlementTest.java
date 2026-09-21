package com.fitto.sticker;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.StickerPacks;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Plan;
import com.fitto.common.plan.Store;
import com.fitto.common.plan.Subscription;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.SubscriptionStatus;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.sticker.domain.UserStickerPurchase;
import com.fitto.sticker.repository.UserStickerPurchaseRepository;
import com.fitto.sticker.service.StickerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 하이브리드 판정 — 무료 팩 · 낱개 구매 · PRO 구독의 세 갈래가 각각 열리는가.
 *
 * <p>무료 체험 플래그를 <b>끄고</b> 돈다 — 켜진 채(운영 기본값)로는 전원 PRO 라 잠금
 * 분기가 아예 실행되지 않는다({@code DeepNutritionStatsTest} 와 같은 이유).
 *
 * <p>가장 중요한 테스트는 {@code 무료_이모티콘은_그대로_무료다} 와
 * {@code 내린_캐릭터의_지난_코드도_막히지_않는다} 다. 이 기능의 최악의 실패는 유료 팩이
 * 새는 게 아니라 <b>무료라고 보여 준 것을 서버가 막는 것</b>이고, STOMP 는 402 를 화면으로
 * 돌려줄 수 없어 말풍선이 "전송 중"에서 영영 멈춘다
 * (docs/STICKER_PACK_OVERLAP_2026-09-14.md).
 */
@SpringBootTest(properties = {
        "fitto.plan.free-trial=false",
        "fitto.plan.trial-days=0"})
@ActiveProfiles("test")
class StickerEntitlementTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired ChatService chatService;
    @Autowired StickerService stickerService;
    @Autowired UserStickerPurchaseRepository purchaseRepository;
    @Autowired SubscriptionRepository subscriptionRepository;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    /** @return {userA, userB, relationId} */
    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse relation = relationService.connectCouple(b, invite.code());
        return new long[]{a, b, relation.id()};
    }

    private void goPro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    private void buy(Long userId, String packId) {
        purchaseRepository.save(UserStickerPurchase.builder()
                .userId(userId)
                .stickerPackId(packId)
                .transactionId("txn-" + userId + "-" + packId)
                .build());
    }

    @Test
    void 무료_이모티콘은_그대로_무료다() {
        Long user = register("sticker-free@fitto.com");

        assertThat(stickerService.canUse(user, StickerPacks.ANIM_BASIC)).isTrue();
        assertThat(stickerService.canUse(user, StickerPacks.BEAR)).isTrue();
        assertThat(stickerService.canUse(user, StickerPacks.TOUCH_BASIC)).isTrue();
        assertThatCode(() -> stickerService.requireUsable(user, StickerPacks.ANIM_BASIC))
                .doesNotThrowAnyException();
    }

    @Test
    void 팩에_없는_코드는_무료로_통과한다() {
        Long user = register("sticker-unknown@fitto.com");

        // 유니코드 이모지 · 우리 이모지 id · 서버가 모르는 팩 — 전부 막지 않는다.
        // 막으면 앱이 서버보다 앞선 배포일 때 말풍선이 "전송 중"에 멈춘다.
        assertThatCode(() -> {
            stickerService.requireUsable(user, null);
            stickerService.requireUsable(user, "AN_UNKNOWN_PACK");
        }).doesNotThrowAnyException();
    }

    @Test
    void 내린_캐릭터의_지난_코드도_막히지_않는다() {
        long[] ids = couple("sticker-retired-a@fitto.com", "sticker-retired-b@fitto.com");

        // 더비·블리는 피커에서 내렸지만 지난 말풍선의 content 에 코드가 남아 있다.
        // 팩이 없으므로 판정을 지나지 않는다 — 다시 보내도 402 가 나지 않아야 한다.
        assertThatCode(() -> chatService.send(ids[0], ids[2],
                new SendMessageRequest(MessageType.STICKER, "DUBI_LIKE", null, null, null, null)))
                .doesNotThrowAnyException();
    }

    @Test
    void 유료팩은_무료_사용자에게_잠긴다() {
        Long user = register("sticker-locked@fitto.com");

        assertThat(stickerService.canUse(user, StickerPacks.ANIM_LOVE)).isFalse();
        assertThatThrownBy(() -> stickerService.requireUsable(user, StickerPacks.ANIM_LOVE))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    @Test
    void 낱개로_산_팩만_열린다() {
        Long user = register("sticker-bought@fitto.com");
        buy(user, StickerPacks.ANIM_LOVE);

        assertThat(stickerService.canUse(user, StickerPacks.ANIM_LOVE)).isTrue();
        // 산 것만 열린다 — 한 팩을 샀다고 나머지가 따라 열리면 구독을 팔 이유가 없다
        assertThat(stickerService.canUse(user, StickerPacks.ANIM_CHEER)).isFalse();
    }

    @Test
    void PRO는_유료팩_전부가_열린다() {
        Long user = register("sticker-pro@fitto.com");
        goPro(user);

        assertThat(stickerService.canUse(user, StickerPacks.ANIM_LOVE)).isTrue();
        assertThat(stickerService.canUse(user, StickerPacks.ANIM_CHEER)).isTrue();
        assertThat(stickerService.canUse(user, StickerPacks.MOOD_PREMIUM)).isTrue();
        assertThat(stickerService.canUse(user, StickerPacks.TOUCH_PREMIUM)).isTrue();
    }

    @Test
    void 한쪽이_산_팩은_커플_둘_다_쓴다() {
        long[] ids = couple("sticker-couple-a@fitto.com", "sticker-couple-b@fitto.com");
        buy(ids[0], StickerPacks.ANIM_CELEBRATE);

        // 소유는 산 사람에게 붙지만 사용은 관계 단위다 — Feature.PREMIUM_STICKER 가 이미
        // 커플 판정이라, 낱개만 개인 판정으로 두면 "구독으로 열면 둘 다 쓰는데 낱개로 사면
        // 나만 쓴다"는 설명할 수 없는 차이가 생긴다.
        assertThat(stickerService.canUse(ids[1], StickerPacks.ANIM_CELEBRATE)).isTrue();
        assertThat(stickerService.ownedPackIds(ids[1])).contains(StickerPacks.ANIM_CELEBRATE);
    }

    @Test
    void 팩_목록은_무료가_먼저_오고_소유_여부를_함께_준다() {
        Long user = register("sticker-list@fitto.com");
        buy(user, StickerPacks.ANIM_CHILL);

        var entitlements = stickerService.entitlements(user);
        assertThat(entitlements).isNotEmpty();

        // 무료 팩이 앞 — 잠긴 팩이 스트립 앞에 서면 패널이 유료처럼 보인다
        int firstPaid = 0;
        while (firstPaid < entitlements.size()
                && entitlements.get(firstPaid).pack().isFreeForEveryone()) {
            firstPaid++;
        }
        assertThat(entitlements.subList(firstPaid, entitlements.size()))
                .allMatch(e -> !e.pack().isFreeForEveryone());

        var bought = entitlements.stream()
                .filter(e -> e.pack().getId().equals(StickerPacks.ANIM_CHILL))
                .findFirst().orElseThrow();
        assertThat(bought.usable()).isTrue();
        assertThat(bought.purchased()).isTrue();

        // 구독으로 열린 게 아니라 산 것이다 — 구독이 끊겼을 때 화면이 달라져야 해서 나눠 둔다
        var notBought = entitlements.stream()
                .filter(e -> e.pack().getId().equals(StickerPacks.ANIM_CHEER))
                .findFirst().orElseThrow();
        assertThat(notBought.usable()).isFalse();
        assertThat(notBought.purchased()).isFalse();
    }

    @Test
    void 스토어_상품_id_는_팩_id_를_소문자로_눕힌_것이다() {
        var love = stickerService.entitlements(register("sticker-product@fitto.com")).stream()
                .filter(e -> e.pack().getId().equals(StickerPacks.ANIM_LOVE))
                .findFirst().orElseThrow();
        // 스토어 콘솔에 등록할 때 이 규칙을 따라야 한다 — 어긋나면 산 사람이 못 쓴다
        assertThat(love.pack().productId()).isEqualTo("sticker_pack_anim_love");
    }
}
