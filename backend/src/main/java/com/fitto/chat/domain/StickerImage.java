package com.fitto.chat.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 이미지 스티커 — {@link MessageType#STICKER} 메시지 중 유니코드 이모지가 아니라
 * 로컬 번들 이미지로 그려지는 것들. {@code content} 값은 이 enum 의 {@link #name()}
 * 그대로 저장된다({@link TouchGesture} 와 같은 방식).
 *
 * <p>프론트 {@code frontend/src/constants/stickerImages.ts} 와 코드가 정확히 짝을
 * 맞춰야 한다 — 여기서 추가하면 거기도 같이 추가할 것. 어긋나면
 * {@code StickerImageSyncTest} 가 잡는다. 다만 <b>캐릭터 구분과 트레이 순서는 프론트에만
 * 있다</b>({@code STICKER_CHARACTERS}) — 서버는 코드로 라벨 하나만 찾으면 되고, 여기 선언
 * 순서는 화면에 영향을 주지 않는다.
 *
 * <p>일반 이모지 스티커(예: "💕")는 이 enum 에 없으므로 {@link #from(String)} 이
 * empty 를 반환하고, 알림 미리보기는 기존처럼 이모지 자체를 보여준다.
 *
 * <p><b>여기엔 premium 필드가 없다.</b> 이미지 스티커는 번들 에셋이라 원가가 0이고
 * 전부 무료다 — 비개구리 두 마리(DUBI_*·BLI_*)도 같은 이유로 무료다
 * (docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §17). 유료로 돌릴 장이 생기면 그 코드에
 * 유료 {@link StickerPacks} 를 달면 된다 — 판정은 팩이 하고, 이 enum 은 팩 이름만 들고 있다.
 *
 * <p><b>DUBI_*·BLI_* 는 피커에서 내렸다</b>(2026-09-21). 그림을 새로 교체하기로 해서
 * 앱 카탈로그({@code stickerImages.ts})에서 뺐지만, <b>여기서는 지우지 않는다</b> —
 * 지난 말풍선의 content 에 이 코드가 그대로 저장돼 있어서 enum 이 사라지면 알림
 * 미리보기가 라벨을 못 찾는다. 팩을 주지 않으므로({@code null}) 무료로 통과한다.
 */
public enum StickerImage {
    // 곰돌이 10종 — LOVE_BEAR 한 장뿐이던 것을 variants.mjs 로 감정 변주를 뽑아 세트로 만들었다.
    // LOVE_BEAR 도 같이 다시 그렸지만(글자 제거·테두리 통일) 코드는 그대로라 과거 메시지는 그대로 읽힌다.
    LOVE_BEAR("사랑해", StickerPacks.BEAR),
    BEAR_EXCITED("신났어", StickerPacks.BEAR),
    BEAR_LAUGH("하하하", StickerPacks.BEAR),
    BEAR_SHY("부끄러워", StickerPacks.BEAR),
    BEAR_SULKY("시무룩", StickerPacks.BEAR),
    BEAR_ANGRY("화났어", StickerPacks.BEAR),
    BEAR_SORRY("미안해", StickerPacks.BEAR),
    BEAR_CRYING("엉엉", StickerPacks.BEAR),
    BEAR_TIRED("지쳤어", StickerPacks.BEAR),
    BEAR_SLEEPY("잘자", StickerPacks.BEAR),

    /*
     * ── 아래는 내린 코드다(2026-09-21). 지난 말풍선을 위해서만 남는다 ──
     *
     * 더비(초록)·블리(노랑) 각 14종 — 사용자 손그림을 스티커화한 자체 캐릭터 "비개구리"
     * (설계 메모 §15·§17·§20·§21). 이름은 앱 이름 더블리를 둘로 쪼갠 것이다.
     * 팩이 null 이라 판정에 걸리지 않는다 — 새 그림이 들어오면 새 코드로 추가할 것.
     */
    DUBI_LIKE("좋아", null),
    DUBI_HEHE("히히", null),
    DUBI_LAUGH("하하하", null),
    DUBI_EXCITED("신났어", null),
    DUBI_DANCE("룰루랄라", null),
    DUBI_GIFT("선물이야", null),
    DUBI_WINK("윙크", null),
    DUBI_SULKY("시무룩", null),
    DUBI_GRUMPY("짜증나", null),
    DUBI_ANGRY("화났어", null),
    DUBI_DASH("흥, 간다", null),
    DUBI_GLOOMY("축 처짐", null),
    DUBI_DIZZY("어질~", null),
    DUBI_OFFWORK("퇴근", null),

    BLI_LOVE("좋아좋아", null),
    BLI_KISS("뽀뽀", null),
    BLI_BEAM("방긋", null),
    BLI_CONTENT("흐뭇", null),
    BLI_FLOWER("기분 좋아", null),
    BLI_MAKEUP("꽃단장", null),
    BLI_RIBBON("예뻐졌지?", null),
    BLI_WINK("윙크", null),
    BLI_OH("어머", null),
    BLI_SULKY("시무룩", null),
    BLI_GRUMPY("짜증나", null),
    BLI_CRYING("엉엉", null),
    BLI_GLOOMY("축 처짐", null),
    BLI_SLEEPY("잘자", null);

    private final String label;
    private final String packId;

    StickerImage(String label, String packId) {
        this.label = label;
        this.packId = packId;
    }

    public String label() {
        return label;
    }

    /** 속한 판매 단위 — 내린 코드는 {@code null}(= 판정 대상 아님). */
    public String packId() {
        return packId;
    }

    /** 아직 피커에 있는가 — 내린 코드는 팩이 없다. */
    public boolean isRetired() {
        return packId == null;
    }

    public static Optional<StickerImage> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }
}
