package com.fitto.coupleemoji.domain;

/**
 * 우리 이모지 감정 6종 — 사용자가 고르지 않는다. 사진 한 장 → 세트 한 벌.
 *
 * <p>기존 무드 12종({@code moodEmojis.ts})과 겹치는 결로 골랐다(빡침·행복·신남·슬픔·졸림 + 사랑).
 * 2단계 무드 연동 때 이 순서대로 무드 선택지에 붙는다. 감정별 변주 문구(영문)는 공통 앵커 뒤에
 * 붙어 프롬프트가 된다 — docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-2, 실측 §12-4.
 */
public enum CoupleEmojiEmotion {
    ANGRY("화남", "😤",
            "furious: red flushed cheeks, puffed face, steam clouds rising from the head, furrowed brows, tightly closed mouth"),
    HAPPY("기쁨", "😊",
            "happy and content: warm closed-eye smile, rosy cheeks, small sparkles around the face"),
    EXCITED("신남", "🥳",
            "super excited: both arms raised high, wide open mouth cheering, confetti and stars flying around"),
    SAD("슬픔", "😢",
            "sad: drooping eyebrows, big teary eyes, a single tear rolling down, small rain cloud above the head"),
    SLEEPY("졸림", "😴",
            "sleepy: eyes closed, yawning, head tilted, \"zzz\" letters floating above"),
    LOVE("사랑", "🥰",
            "in love: heart-shaped eyes, blushing, hands making a finger heart, small hearts floating around");

    private final String label;
    private final String moodEmoji;
    private final String expressionPrompt;

    CoupleEmojiEmotion(String label, String moodEmoji, String expressionPrompt) {
        this.label = label;
        this.moodEmoji = moodEmoji;
        this.expressionPrompt = expressionPrompt;
    }

    /**
     * 무드로 쓸 때 함께 저장하는 유니코드 대역 — {@code mood_statuses.emoji} 는 NOT NULL 이고
     * 푸시 미리보기가 그 값을 그대로 읽는다(V81 주석). 이미지를 못 그리는 자리에서도 감정이
     * 읽히도록 <b>기본 무드 12종 중에서</b> 골랐다({@code MOOD_EMOJIS} 의 빡침·좋음·신남·슬픔·졸림·행복).
     *
     * <p><b>확장팩(PRO) 이모지를 쓰면 안 된다</b> — {@code MoodService.set} 이 {@code MoodPack.isPremium}
     * 으로 PRO 판정을 하므로, 무료 사용자가 자기 우리 이모지를 무드로 걸 때 402 가 난다.
     */
    public String moodEmoji() {
        return moodEmoji;
    }

    /** 한국어 라벨 — 알림 미리보기·트레이 툴팁용 */
    public String label() {
        return label;
    }

    /** 프롬프트의 "Expression:" 뒤에 붙는 감정별 변주 */
    public String expressionPrompt() {
        return expressionPrompt;
    }
}
