package com.fitto.sticker.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.AppStoreServerApiClient;
import com.fitto.common.plan.GooglePlayDeveloperApiClient;
import com.fitto.common.plan.StoreProductPurchase;
import com.fitto.sticker.domain.StickerPack;
import com.fitto.sticker.domain.UserStickerPurchase;
import com.fitto.sticker.repository.StickerPackRepository;
import com.fitto.sticker.repository.UserStickerPurchaseRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * 스티커 팩 낱개 구매의 검증과 기록 — 구독의 {@code *SubscriptionSyncService} 에 대응한다.
 *
 * <p><b>앱이 보낸 내용을 믿지 않는다.</b> 앱은 영수증 식별자만 넘기고, 무슨 상품인지도
 * 누구 것인지도 스토어에 되물어서 정한다({@link StoreProductPurchase} 주석). 이건 구독
 * 검증이 이미 쓰고 있는 원칙 그대로다 — 남의 거래 id 를 보내도 자기 계정에 팩이 붙지 않는다.
 *
 * <p><b>스토어 키가 없으면 거절한다.</b> 구독 동기화는 키가 없을 때 조용히 건너뛰는데
 * (웹훅이라 실패해도 다음 신호가 또 온다) 여기는 사용자가 방금 결제를 누른 자리다.
 * 조용히 넘어가면 돈은 나갔는데 팩이 안 열린 채로 아무 말도 없게 된다.
 *
 * <p><b>검증 메서드에 {@code @Transactional} 을 걸지 않는다.</b> 이유가 둘이다.
 * <ol>
 *   <li><b>멱등 처리가 실제로 동작하게 하려고.</b> {@code UserStickerPurchase} 는
 *       {@code GenerationType.IDENTITY} 라 {@code save()} 가 즉시 INSERT 를 날리고, unique
 *       인덱스에 걸리면 <b>Hibernate 가 그 트랜잭션을 rollback-only 로 표시한다</b>. 바깥에
 *       트랜잭션이 있으면 {@link DataIntegrityViolationException} 을 잡아도 커밋 시점에
 *       {@code UnexpectedRollbackException} 이 떠서 결국 500 이 나간다 — 결제는 됐는데
 *       에러가 뜨는 최악의 자리다. 트랜잭션을 저장 한 줄({@code SimpleJpaRepository.save})
 *       에만 남겨 두면 위반이 그 안에서만 롤백되고 여기서 잡는 것이 뜻대로 동작한다.</li>
 *   <li><b>스토어 왕복이 커넥션을 물고 있지 않게.</b> Play·App Store 조회는 타임아웃이
 *       15초다. 트랜잭션 안에서 부르면 그동안 DB 커넥션 하나가 묶인다.</li>
 * </ol>
 * 여기서 잃는 원자성은 없다 — 쓰기가 INSERT 한 줄뿐이다.
 */
@Service
public class StickerPurchaseService {

    private static final Logger log = LoggerFactory.getLogger(StickerPurchaseService.class);

    private final StickerPackRepository packRepository;
    private final UserStickerPurchaseRepository purchaseRepository;
    private final GooglePlayDeveloperApiClient googlePlayClient;
    private final AppStoreServerApiClient appStoreClient;

    public StickerPurchaseService(StickerPackRepository packRepository,
                                  UserStickerPurchaseRepository purchaseRepository,
                                  GooglePlayDeveloperApiClient googlePlayClient,
                                  AppStoreServerApiClient appStoreClient) {
        this.packRepository = packRepository;
        this.purchaseRepository = purchaseRepository;
        this.googlePlayClient = googlePlayClient;
        this.appStoreClient = appStoreClient;
    }

    /**
     * Play 결제 직후 앱이 부른다.
     *
     * @param packId 앱이 무엇을 샀다고 주장하는지 — <b>검증 대상이지 근거가 아니다</b>.
     *               스토어가 돌려준 상품 id 와 다르면 거절한다.
     */
    public StickerPack verifyGoogle(Long userId, String packId, String purchaseToken) {
        StickerPack pack = requirePurchasablePack(packId);
        StoreProductPurchase purchase = googlePlayClient.fetchProduct(pack.productId(), purchaseToken);
        return record(userId, pack, purchase, purchaseToken);
    }

    /** App Store 결제 직후 앱이 부른다 — {@link #verifyGoogle} 의 짝. */
    public StickerPack verifyApple(Long userId, String packId, String transactionId) {
        StickerPack pack = requirePurchasablePack(packId);
        StoreProductPurchase purchase = appStoreClient.fetchTransaction(transactionId);
        return record(userId, pack, purchase, transactionId);
    }

    private StickerPack requirePurchasablePack(String packId) {
        StickerPack pack = packRepository.findById(packId == null ? "" : packId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "없는 스티커 팩이에요."));
        if (!pack.isPurchasable()) {
            // 무료 팩에 결제를 붙이면 "돈 냈는데 원래 무료였다"가 된다 — 기록도 남기지 않는다.
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이 팩은 따로 구매하지 않아도 돼요.");
        }
        return pack;
    }

    /**
     * 스토어 응답을 대조하고 소유 행을 남긴다.
     *
     * <p>세 가지를 본다 — 조회가 됐는가 · 유효한 결제인가 · <b>우리가 아는 사람의 것인가</b>.
     * 마지막이 핵심이다: 귀속은 스토어가 돌려준 계정 식별자로만 정하고, 로그인한 사람과
     * 다르면 붙이지 않는다.
     */
    private StickerPack record(Long userId, StickerPack pack, StoreProductPurchase purchase, String transactionId) {
        if (purchase == null) {
            log.warn("스티커 팩 결제 검증 실패 — 스토어 조회 불가 (pack={}, userId={})", pack.getId(), userId);
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제를 확인하지 못했어요. 잠시 후 다시 시도해주세요.");
        }
        if (!purchase.valid()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "아직 완료되지 않았거나 취소된 결제예요.");
        }
        if (!pack.productId().equals(purchase.productId())) {
            // 토큰과 팩이 짝이 안 맞는다 — 다른 팩의 영수증으로 이 팩을 열려는 시도다.
            log.warn("스티커 팩 결제 상품 불일치 — 요청={} 스토어={}", pack.productId(), purchase.productId());
            throw new BusinessException(ErrorCode.INVALID_INPUT, "결제 내역과 스티커 팩이 맞지 않아요.");
        }
        if (purchase.userId() == null || !purchase.userId().equals(userId)) {
            log.warn("스티커 팩 결제 귀속 불일치 — 로그인={} 스토어={}", userId, purchase.userId());
            throw new BusinessException(ErrorCode.FORBIDDEN, "다른 계정에서 결제된 내역이에요.");
        }

        Optional<UserStickerPurchase> already =
                purchaseRepository.findByUserIdAndStickerPackId(userId, pack.getId());
        if (already.isPresent()) {
            // 복원·재설치로 같은 영수증이 다시 온다. 멱등이 정상이지 에러가 아니다.
            return pack;
        }
        try {
            /*
             * save() 가 자기 트랜잭션을 연다(SimpleJpaRepository 가 @Transactional). 그래서
             * 아래 catch 가 뜻대로 동작한다 — 이 메서드에 트랜잭션을 걸면 안 되는 이유는
             * 클래스 주석에 있다.
             */
            purchaseRepository.save(UserStickerPurchase.builder()
                    .userId(userId)
                    .stickerPackId(pack.getId())
                    .transactionId(transactionId)
                    .build());
        } catch (DataIntegrityViolationException e) {
            // 동시에 두 번 눌린 경우 — unique 인덱스가 막는다. 이미 열려 있으므로 성공으로 본다.
            log.debug("스티커 팩 구매 행 중복 — 이미 소유 (pack={}, userId={})", pack.getId(), userId);
        }
        return pack;
    }
}
