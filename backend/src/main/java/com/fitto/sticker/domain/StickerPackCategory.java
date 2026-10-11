package com.fitto.sticker.domain;

import com.fitto.common.plan.Feature;

/**
 * 팩이 어느 표현 수단에 속하는가 — <b>PRO 판정을 어느 {@link Feature} 로 할지를 여기서 정한다.</b>
 *
 * <p>팩 행에 feature 컬럼을 따로 두지 않은 이유다. 게이트는 이미 두 개뿐이고
 * ({@code PREMIUM_STICKER} · {@code TOUCH_GESTURE_PREMIUM}) 둘 다 "원가 0의 꾸미기"라
 * 성격이 같다. 시드 데이터에 enum 이름을 한 번 더 적게 하면 카테고리와 feature 가
 * 어긋난 행을 만들 수 있고, 그건 DB 만 보고는 못 찾는다.
 */
public enum StickerPackCategory {

    /** Lottie 로 재생되는 움직이는 이모티콘 */
    ANIMATED(Feature.PREMIUM_STICKER),
    /** 번들 PNG 캐릭터 스티커 */
    IMAGE(Feature.PREMIUM_STICKER),
    /** 무드 아이콘 */
    MOOD(Feature.PREMIUM_STICKER),
    /** 가상 터치 제스처 — 스티커가 아니라 {@code MessageType.TOUCH} 지만, 파는 모양이 같다 */
    TOUCH(Feature.TOUCH_GESTURE_PREMIUM);

    private final Feature feature;

    StickerPackCategory(Feature feature) {
        this.feature = feature;
    }

    /** 이 카테고리의 유료 팩이 구독으로 열리는 게이트. */
    public Feature feature() {
        return feature;
    }
}
