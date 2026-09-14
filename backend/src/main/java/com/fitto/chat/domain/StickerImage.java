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
 * 전부 무료다 — 비개구리 세트(BIGAE_*)도 같은 이유로 무료다
 * (docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §17). PRO 로 돌릴 장이 생기면
 * {@link AnimatedSticker} 처럼 premium 을 만들고
 * {@code ChatService.send} 의 판정 조건에도 이 enum 을 넣어야 한다 — 현재 그 조건은
 * 두 enum 만 보므로, 필드만 추가하면 서버가 막지 않는다.
 */
public enum StickerImage {
    // 곰돌이 10종 — LOVE_BEAR 한 장뿐이던 것을 variants.mjs 로 감정 변주를 뽑아 세트로 만들었다.
    // LOVE_BEAR 도 같이 다시 그렸지만(글자 제거·테두리 통일) 코드는 그대로라 과거 메시지는 그대로 읽힌다.
    LOVE_BEAR("사랑해"),
    BEAR_EXCITED("신났어"),
    BEAR_LAUGH("하하하"),
    BEAR_SHY("부끄러워"),
    BEAR_SULKY("시무룩"),
    BEAR_ANGRY("화났어"),
    BEAR_SORRY("미안해"),
    BEAR_CRYING("엉엉"),
    BEAR_TIRED("지쳤어"),
    BEAR_SLEEPY("잘자"),

    // 비개구리 17종 — 사용자 손그림 스케치를 스티커화한 자체 캐릭터(설계 메모 §15·§17·§20).
    // 1차 10종 + 2차 스케치 8종(LIKE·HEHE·KISS·GIFT·DANCE·GRUMPY·DIZZY·OFFWORK) − BIGAE_WIGGLE.
    // WIGGLE(뒷모습 엉덩이)은 DANCE(뒷모습 + 음표)와 실루엣이 같아 뺐다(§20). 배포 전이라
    // 그 코드로 보낸 메시지는 없다 — 있었다면 말풍선에 코드 문자열이 그대로 뜬다.
    BIGAE_LOVE("좋아좋아"),
    BIGAE_LIKE("좋아"),
    BIGAE_HEHE("히히"),
    BIGAE_LAUGH("하하하"),
    BIGAE_KISS("뽀뽀"),
    BIGAE_GIFT("선물이야"),
    BIGAE_EXCITED("신났어"),
    BIGAE_DANCE("룰루랄라"),
    BIGAE_SULKY("시무룩"),
    BIGAE_GRUMPY("짜증나"),
    BIGAE_ANGRY("화났어"),
    BIGAE_DASH("흥, 간다"),
    BIGAE_CRYING("엉엉"),
    BIGAE_GLOOMY("축 처짐"),
    BIGAE_DIZZY("어질~"),
    BIGAE_OFFWORK("퇴근"),
    BIGAE_SLEEPY("잘자");

    private final String label;

    StickerImage(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    public static Optional<StickerImage> from(String code) {
        return Arrays.stream(values()).filter(s -> s.name().equals(code)).findFirst();
    }
}
