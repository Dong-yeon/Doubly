package com.fitto.sticker.dto;

import com.fitto.sticker.domain.StickerPack;
import com.fitto.sticker.domain.StickerPackCategory;
import com.fitto.sticker.service.StickerService;

/**
 * 팩 한 개 + 이 사람 기준의 잠금 상태 — 앱의 패널 자물쇠와 구매 시트가 이 한 줄로 그려진다.
 *
 * <p><b>그림은 싣지 않는다.</b> 어느 코드가 이 팩에 속하는지는 앱이 이미 번들로 들고 있고
 * ({@code constants/stickerPacks.ts}), 서버가 또 내리면 같은 표가 두 곳에 생긴다.
 * 여기 있는 건 "얼마고, 열려 있고, 샀나"뿐이다.
 *
 * @param usable    지금 쓸 수 있는가 — 무료이거나, 샀거나, PRO 이거나
 * @param purchased <b>낱개로 샀는가.</b> {@code usable} 과 나눠 두는 이유는 구독이 끊겼을 때
 *                  화면이 달라져야 하기 때문이다 — 산 팩은 그대로 열려 있고, 구독으로만
 *                  열려 있던 팩은 잠긴다. 한 값으로 합치면 앱이 그 차이를 그릴 수 없다
 * @param price     낱개 구매가(KRW). 0 이면 낱개로 팔지 않는다
 * @param productId 스토어 상품 id — 앱이 결제를 걸 때 그대로 쓴다. 규칙이 서버에만 있으면
 *                  양쪽이 어긋날 일이 없다({@link StickerPack#productId()})
 */
public record StickerPackResponse(
        String id,
        String title,
        StickerPackCategory category,
        boolean proOnly,
        int price,
        String productId,
        boolean usable,
        boolean purchased
) {
    public static StickerPackResponse from(StickerService.PackEntitlement entitlement) {
        StickerPack pack = entitlement.pack();
        return new StickerPackResponse(
                pack.getId(), pack.getTitle(), pack.getCategory(), pack.isProOnly(), pack.getPrice(),
                pack.isPurchasable() ? pack.productId() : null,
                entitlement.usable(), entitlement.purchased());
    }
}
