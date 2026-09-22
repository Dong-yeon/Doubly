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
 * <p><b>지금은 전부 내려가 있다</b>(2026-09-21). 그림 출처를 정리하는 동안 이미지 스티커를
 * 피커에서 통째로 뺐다 — 패널에는 움직이는 이모티콘(Noto, 라이선스 확실)과 우리 이모지
 * (사용자 본인 사진)만 남는다. <b>여기서 지우지는 않는다</b>: 지난 말풍선의 content 에 이
 * 코드가 그대로 저장돼 있어서 enum 이 사라지면 알림 미리보기가 라벨을 못 찾는다.
 * 팩을 주지 않으므로({@code null}) 판정을 지나지 않고 무료로 통과한다.
 *
 * <p>되살릴 때는 {@link StickerPacks} 상수를 다시 달고 {@code stickerImages.ts} 의
 * {@code RETIRED_STICKER_IMAGES} 에서 {@code STICKER_CHARACTERS} 로 옮기면 된다.
 * <b>더비·블리는 출처 문제가 없다</b> — 동연님 손그림 스케치에서 나온 자체 캐릭터다.
 */
public enum StickerImage {
    /*
     * ── 삶은달걀 23종 · 맥반석 x 삶은달걀 20종 (2026-09-21) ──
     *
     * 동연님이 직접 만든 자체 캐릭터다. 찜질방 짝꿍 — 흰 쪽이 삶은달걀(머리에 꽃),
     * 갈색이 맥반석이다. 커플 팩은 두 마리가 함께 나오는 짝 스티커라 가로가 넓다.
     *
     * 캐릭터 스티커는 스티커 상점의 낱개 구매 상품이지만 <b>이 두 팩은 0원</b>이다 —
     * 상점을 여는 첫 물건이라 무료로 푼다. 한 번 무료로 준 것은 되돌릴 수 없다
     * (StickerPackSyncTest 가 막는다).
     */
    EGG_AWKWARD("난감", StickerPacks.EGG_BOILED),
    EGG_GLOOMY("우울", StickerPacks.EGG_BOILED),
    EGG_IDEA("아하", StickerPacks.EGG_BOILED),
    EGG_SLEEPY("졸려", StickerPacks.EGG_BOILED),
    EGG_FURIOUS("폭발", StickerPacks.EGG_BOILED),
    EGG_ANGRY("화났어", StickerPacks.EGG_BOILED),
    EGG_SULKY("삐짐", StickerPacks.EGG_BOILED),
    EGG_GRUMPY("흥", StickerPacks.EGG_BOILED),
    EGG_KISS("뽀뽀", StickerPacks.EGG_BOILED),
    EGG_EYE_ROLL("하아", StickerPacks.EGG_BOILED),
    EGG_UNAMUSED("시큰둥", StickerPacks.EGG_BOILED),
    EGG_SWEAT("식은땀", StickerPacks.EGG_BOILED),
    EGG_HAPPY("행복", StickerPacks.EGG_BOILED),
    EGG_RELAXED("편안", StickerPacks.EGG_BOILED),
    EGG_DROOL("군침", StickerPacks.EGG_BOILED),
    EGG_PROUD("뿌듯", StickerPacks.EGG_BOILED),
    EGG_ANGEL("천사", StickerPacks.EGG_BOILED),
    EGG_SHOCKED("헉", StickerPacks.EGG_BOILED),
    EGG_MELTING("녹는다", StickerPacks.EGG_BOILED),
    EGG_FROZEN("얼었어", StickerPacks.EGG_BOILED),
    EGG_HOT("더워", StickerPacks.EGG_BOILED),
    EGG_SALUTE("넵", StickerPacks.EGG_BOILED),
    EGG_LOVE("사랑해", StickerPacks.EGG_BOILED),

    DUO_SAD("속상해", StickerPacks.EGG_DUO),
    DUO_GLOOMY("우울", StickerPacks.EGG_DUO),
    DUO_IDEA("아하", StickerPacks.EGG_DUO),
    DUO_SLEEP("잘자", StickerPacks.EGG_DUO),
    DUO_FIGHT("대판 싸움", StickerPacks.EGG_DUO),
    DUO_GLARE("째려봄", StickerPacks.EGG_DUO),
    DUO_FURIOUS("폭발", StickerPacks.EGG_DUO),
    DUO_KISS("뽀뽀", StickerPacks.EGG_DUO),
    DUO_DIZZY("어질어질", StickerPacks.EGG_DUO),
    DUO_SULKY("삐짐", StickerPacks.EGG_DUO),
    DUO_HAPPY("신남", StickerPacks.EGG_DUO),
    DUO_RELAXED("편안", StickerPacks.EGG_DUO),
    DUO_DROOL("군침", StickerPacks.EGG_DUO),
    DUO_WINK("찡긋", StickerPacks.EGG_DUO),
    DUO_HEART_EYES("반했어", StickerPacks.EGG_DUO),
    DUO_CRY("엉엉", StickerPacks.EGG_DUO),
    DUO_FROZEN("얼었어", StickerPacks.EGG_DUO),
    DUO_LOVE("사랑해", StickerPacks.EGG_DUO),
    DUO_SHOCKED("헉", StickerPacks.EGG_DUO),
    DUO_HEATED("열받아", StickerPacks.EGG_DUO),

    /*
     * ── 아래는 전부 내린 코드다(2026-09-21). 지난 말풍선을 위해서만 남는다 ──
     *
     * 곰돌이 10종 — 완성본 한 장을 참조 삼아 variants.mjs 로 감정 변주를 뽑은 세트다.
     * 그 참조 그림의 출처가 확인되지 않아 함께 내렸다.
     */
    LOVE_BEAR("사랑해", null),
    BEAR_EXCITED("신났어", null),
    BEAR_LAUGH("하하하", null),
    BEAR_SHY("부끄러워", null),
    BEAR_SULKY("시무룩", null),
    BEAR_ANGRY("화났어", null),
    BEAR_SORRY("미안해", null),
    BEAR_CRYING("엉엉", null),
    BEAR_TIRED("지쳤어", null),
    BEAR_SLEEPY("잘자", null),

    /*
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
