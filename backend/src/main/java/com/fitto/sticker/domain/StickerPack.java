package com.fitto.sticker.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * 판매 단위로서의 스티커 팩 — {@code sticker_packs} 한 행.
 *
 * <p><b>이 행은 무엇이 들어 있는지를 모른다.</b> 코드 → 팩 매핑은 앱과 서버 양쪽의 카탈로그에
 * 있고({@code chat.domain.StickerPackIds}, {@code constants/stickerPacks.ts}), 여기 있는 건
 * "이 팩은 얼마고 누구에게 열려 있나"뿐이다. 그림이 바뀌거나 장수가 늘어도 이 행은 그대로라,
 * 에셋 교체가 마이그레이션을 부르지 않는다.
 *
 * <p>행은 <b>Flyway 시드로만 생긴다</b>. 런타임에 팩을 만들 경로가 없는 것은 의도다 —
 * 팩이 늘면 앱에 그림도 같이 들어가야 하므로 어차피 배포가 필요하다.
 */
@Entity
@Table(name = "sticker_packs")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StickerPack {

    @Id
    @Column(length = 40)
    private String id;

    @Column(nullable = false, length = 60)
    private String title;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StickerPackCategory category;

    @Column(name = "is_pro_only", nullable = false)
    private boolean proOnly;

    /** 낱개 구매가(KRW). 0 이면 낱개로 팔지 않는다 — 무료이거나 구독 전용이거나. */
    @Column(nullable = false)
    private int price;

    @Column(name = "created_at", nullable = false, updatable = false, insertable = false)
    private LocalDateTime createdAt;

    /**
     * 누구에게나 열린 팩인가.
     *
     * <p>두 조건을 <b>모두</b> 본다. 값이 어긋난 행(무료인데 가격이 붙어 있다 / PRO 전용인데
     * 공짜다)이 생기면 "잠기지 않았는데 결제를 권한다" 같은 상태가 되므로, 애매하면 잠그는
     * 쪽이 아니라 <b>여는 쪽</b>으로 판정한다 — 2026-09-14 의 교훈은 "무료라고 보여 준 것을
     * 막으면 사용자는 고장으로 받아들인다"였다.
     */
    public boolean isFreeForEveryone() {
        return !proOnly && price == 0;
    }

    /** 낱개로 살 수 있는가 — 스토어에 상품이 등록돼 있어야 한다. */
    public boolean isPurchasable() {
        return price > 0;
    }

    /**
     * 스토어 상품 id — 팩 id 를 소문자로 눕힌 것.
     *
     * <p>컬럼으로 두지 않은 이유: 한 팩이 Play 와 App Store 양쪽에 같은 id 로 올라가고,
     * 규칙이 고정돼 있어 행마다 적으면 오타가 곧 "산 사람이 못 쓰는" 사고가 된다.
     * 스토어 콘솔에 등록할 때 이 규칙을 따를 것 — {@code ANIM_LOVE → sticker_pack_anim_love}.
     */
    public String productId() {
        return "sticker_pack_" + id.toLowerCase(Locale.ROOT);
    }
}
