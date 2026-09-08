package com.fitto.coupleemoji.domain;

/**
 * 우리 이모지 감정 6종 — 사용자가 고르지 않는다. 사진 한 장 → 세트 한 벌.
 *
 * <p>기존 무드 12종({@code moodEmojis.ts})과 겹치는 결로 골랐다(빡침·행복·신남·슬픔·졸림 + 사랑).
 * 2단계 무드 연동 때 이 순서대로 무드 선택지에 붙는다. 감정별 변주 문구(영문)는 공통 앵커 뒤에
 * 붙어 프롬프트가 된다 — docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-2, 실측 §12-4.
 */
public enum CoupleEmojiEmotion {
    ANGRY("화남",
            "furious: red flushed cheeks, puffed face, steam clouds rising from the head, furrowed brows, tightly closed mouth"),
    HAPPY("기쁨",
            "happy and content: warm closed-eye smile, rosy cheeks, small sparkles around the face"),
    EXCITED("신남",
            "super excited: both arms raised high, wide open mouth cheering, confetti and stars flying around"),
    SAD("슬픔",
            "sad: drooping eyebrows, big teary eyes, a single tear rolling down, small rain cloud above the head"),
    SLEEPY("졸림",
            "sleepy: eyes closed, yawning, head tilted, \"zzz\" letters floating above"),
    LOVE("사랑",
            "in love: heart-shaped eyes, blushing, hands making a finger heart, small hearts floating around");

    private final String label;
    private final String expressionPrompt;

    CoupleEmojiEmotion(String label, String expressionPrompt) {
        this.label = label;
        this.expressionPrompt = expressionPrompt;
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
