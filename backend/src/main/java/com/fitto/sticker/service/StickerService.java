package com.fitto.sticker.service;

import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.sticker.domain.StickerPack;
import com.fitto.sticker.repository.StickerPackRepository;
import com.fitto.sticker.repository.UserStickerPurchaseRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

/**
 * "이 사람이 이 팩을 쓸 수 있나" — 스티커 판정의 단일 출처.
 *
 * <p><b>세 갈래로 열린다.</b> 순서가 곧 비용 순서다(앞의 둘은 질의가 없거나 인덱스 하나).
 * <ol>
 *   <li><b>무료 팩</b> — {@code is_pro_only = false AND price = 0}. 여기서 끝나는 게
 *       대부분이다</li>
 *   <li><b>낱개 구매</b> — {@code user_sticker_purchases} 에 행이 있다. 구독과 무관하게
 *       영구 소유라 {@link PlanGuard} 를 아예 지나지 않는다</li>
 *   <li><b>PRO 구독</b> — {@link PlanGuard#require} 에 그대로 위임한다</li>
 * </ol>
 *
 * <p><b>왜 마지막을 PlanGuard 에 넘기나</b>: 402 문구·에러 코드(PLAN_UPGRADE_REQUIRED vs
 * USAGE_LIMIT_EXCEEDED)와 {@code FEATURE_USED}/{@code FEATURE_BLOCKED} 계측이 전부 거기
 * 붙어 있다. 여기서 직접 던지면 "돈 낸 사용자에게 결제를 또 권하지 않는다"는 규칙과
 * 기능 사용량 지표가 이 경로에서만 조용히 사라진다(CLAUDE.md 4절).
 *
 * <p><b>낱개 구매 경로는 계측하지 않는다.</b> {@code FEATURE_USED} 는 "플랜 게이트를
 * 통과했다"의 기록인데 산 팩은 게이트를 지나지 않는다. 그 팩이 얼마나 팔렸는지는
 * {@code user_sticker_purchases} 행이 직접 답한다.
 *
 * <p><b>소유는 개인, 사용은 커플.</b> 구매 행은 산 사람에게 붙지만({@code UserStickerPurchase}
 * 주석) 판정은 커플 상대까지 퍼진다 — {@code Feature.PREMIUM_STICKER} 가 이미 커플 단위
 * 판정이라({@code Feature.isCoupleScoped}) 낱개만 개인 판정으로 두면 "구독으로 열면 둘 다
 * 쓰는데 낱개로 사면 나만 쓴다"는 설명할 수 없는 차이가 생긴다.
 */
@Service
public class StickerService {

    private final StickerPackRepository packRepository;
    private final UserStickerPurchaseRepository purchaseRepository;
    private final RelationRepository relationRepository;
    private final PlanGuard planGuard;

    public StickerService(StickerPackRepository packRepository,
                          UserStickerPurchaseRepository purchaseRepository,
                          RelationRepository relationRepository,
                          PlanGuard planGuard) {
        this.packRepository = packRepository;
        this.purchaseRepository = purchaseRepository;
        this.relationRepository = relationRepository;
        this.planGuard = planGuard;
    }

    /**
     * 쓸 수 없으면 던진다 — 402({@code PLAN_UPGRADE_REQUIRED}).
     *
     * <p>{@code packId} 가 {@code null} 이면 통과다. 팩에 속하지 않는 content(유니코드
     * 이모지·우리 이모지·내린 캐릭터의 지난 코드)가 여기로 온다 —
     * {@code StickerPacks} 클래스 주석의 "모르는 코드는 무료다".
     */
    @Transactional(readOnly = true)
    public void requireUsable(Long userId, String packId) {
        if (packId == null) {
            return;
        }
        Optional<StickerPack> found = packRepository.findById(packId);
        if (found.isEmpty()) {
            /*
             * 시드에 없는 팩 id — 앱이 서버보다 앞선 배포이거나 오타다. 막지 않는다.
             * 막으면 STOMP 경로에서 말풍선이 "전송 중"에 멈추고, 사용자는 앱이 고장 난
             * 것으로 받아들인다(docs/STICKER_PACK_OVERLAP_2026-09-14.md).
             */
            return;
        }
        StickerPack pack = found.get();
        if (pack.isFreeForEveryone()) {
            return;
        }
        if (ownedPackIds(userId).contains(packId)) {
            return;
        }
        planGuard.require(userId, pack.getCategory().feature());
    }

    /**
     * 던지지 않는 확인 — 화면이 자동으로 부르는 조회에 쓴다({@link PlanGuard#allows} 와 같은 이유).
     */
    @Transactional(readOnly = true)
    public boolean canUse(Long userId, String packId) {
        if (packId == null) {
            return true;
        }
        Optional<StickerPack> found = packRepository.findById(packId);
        if (found.isEmpty() || found.get().isFreeForEveryone()) {
            return true;
        }
        return ownedPackIds(userId).contains(packId)
                || planGuard.allows(userId, found.get().getCategory().feature());
    }

    /**
     * 팩 목록 + 이 사람의 소유 여부 — 앱의 스티커 상점/패널 잠금 표시에 그대로 쓴다.
     *
     * <p>한 번의 조회로 끝내는 게 목적이다. 팩마다 {@code canUse} 를 부르면 팩 수만큼
     * 구매 질의가 돈다.
     */
    @Transactional(readOnly = true)
    public List<PackEntitlement> entitlements(Long userId) {
        Set<String> owned = ownedPackIds(userId);
        // 카테고리당 게이트가 둘뿐이라 플랜 판정도 두 번이면 끝난다
        boolean stickerPro = planGuard.allows(userId, Feature.PREMIUM_STICKER);
        boolean touchPro = planGuard.allows(userId, Feature.TOUCH_GESTURE_PREMIUM);

        List<PackEntitlement> result = new ArrayList<>();
        for (StickerPack pack : packRepository.findAll()) {
            boolean purchased = owned.contains(pack.getId());
            boolean bySubscription = pack.getCategory().feature() == Feature.TOUCH_GESTURE_PREMIUM
                    ? touchPro
                    : stickerPro;
            boolean usable = pack.isFreeForEveryone() || purchased || bySubscription;
            result.add(new PackEntitlement(pack, usable, purchased));
        }
        // 무료 → 유료, 그 안에서는 id 순. 앱이 다시 정렬하지 않아도 되게 서버가 정해서 내린다.
        result.sort(Comparator
                .comparing((PackEntitlement e) -> e.pack().isFreeForEveryone() ? 0 : 1)
                .thenComparing(e -> e.pack().getId()));
        return result;
    }

    /**
     * 이 사람(과 커플 상대)이 산 팩 id 전부.
     *
     * <p>상대까지 보는 근거는 클래스 주석에 있다. 커플이 없으면 본인 것만 — 판정
     * ({@code PlanResolver.resolveFor})의 폴백과 같은 모양이다.
     */
    @Transactional(readOnly = true)
    public Set<String> ownedPackIds(Long userId) {
        List<Long> owners = new ArrayList<>();
        owners.add(userId);
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream()
                .findFirst()
                .map(relation -> relation.partnerOf(userId))
                .filter(Objects::nonNull)
                .ifPresent(owners::add);
        return Set.copyOf(purchaseRepository.findPackIdsByUserIds(owners));
    }

    /** 팩 한 행 + 이 사람 기준의 판정 결과. */
    public record PackEntitlement(StickerPack pack, boolean usable, boolean purchased) {
    }
}
