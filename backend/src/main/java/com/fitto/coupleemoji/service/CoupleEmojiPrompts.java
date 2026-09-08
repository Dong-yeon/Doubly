package com.fitto.coupleemoji.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 우리 이모지 프롬프트 — 0단계 실험(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §12)에서 확정한 그대로.
 * 실험 스크립트 {@code scripts/couple-emoji-experiment/generate.mjs} 의 {@code vector4} 앵커와
 * {@code --describe} 프롬프트가 원본이다. 여기를 바꾸면 {@link #VERSION} 을 올린다 — 행마다 버전을 남기므로
 * 옛 세트가 왜 다르게 생겼는지 추적할 수 있다.
 *
 * <p><b>2단계 생성이 핵심이다.</b> 이미지 모델에 "머리 길이를 유지하라"고만 하면 6장 중 1~2장이 흔들렸다
 * (크롭 여부 무관). 텍스트 모델이 먼저 외형을 사실 목록으로 뽑아 {@code IDENTITY FACTS} 로 박아 넣자
 * "유지하라"(상대 지시)가 "짧은 머리"(절대 지시)가 되어 두 모델 모두 6/6이 됐다(§12-3).
 */
final class CoupleEmojiPrompts {

    static final String VERSION = "v4";

    private CoupleEmojiPrompts() {
    }

    /* ── 1단계: 외형 사실 추출(텍스트 모델, 무료 키) ────────────────────────────── */

    static final String DESCRIBE = String.join(" ",
            "Describe the MAIN person in this photo (largest, centered face) for a character artist who must draw them recognizably.",
            "Answer each field with a few words, no sentences. Ignore other people.");

    /** JSON 모드 스키마 — 전부 짧은 문자열. 없으면 "none"/"no" 로 채우게 해서 빈 값이 안 생기게 한다. */
    static final Map<String, Object> DESCRIBE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.ofEntries(
                    Map.entry("gender", str("gender presentation, e.g. Male / Female")),
                    Map.entry("hairLength", str("hair length relative to ears/chin/shoulders, e.g. short above ears / shoulder-length / long past shoulders")),
                    Map.entry("hairStyle", str("parted / bangs / wavy / straight / curly / tied etc.")),
                    Map.entry("hairColor", str("hair color")),
                    Map.entry("faceShape", str("round / oval / square / long etc.")),
                    Map.entry("eyes", str("eye shape, e.g. almond / round / narrow / double eyelids")),
                    Map.entry("eyebrows", str("eyebrow shape, e.g. thin / thick / straight / arched")),
                    Map.entry("glasses", str("'no glasses' or the frame shape and color")),
                    Map.entry("facialHair", str("'none' or beard/mustache description")),
                    Map.entry("marks", str("'none' or moles/freckles/scars with position")),
                    Map.entry("outfit", str("garment type and color, e.g. white collared shirt"))),
            "required", List.of("gender", "hairLength", "hairStyle", "hairColor", "faceShape",
                    "eyes", "eyebrows", "glasses", "facialHair", "marks", "outfit"));

    private static Map<String, Object> str(String description) {
        return Map.of("type", "STRING", "description", description);
    }

    /** 스키마 응답을 앵커에 붙일 한 줄로 — 실험 때 모델이 자유 형식으로 내놓던 모양과 같게 콤마로 잇는다. */
    static String factsOf(JsonNode facts) {
        List<String> parts = new ArrayList<>();
        for (String key : List.of("gender", "hairLength", "hairStyle", "hairColor", "faceShape",
                "eyes", "eyebrows", "glasses", "facialHair", "marks", "outfit")) {
            String value = facts.path(key).asText("").trim();
            if (!value.isEmpty()) {
                parts.add(key.equals("hairLength") || key.equals("hairStyle") || key.equals("hairColor")
                        ? value + " hair" : value);
            }
        }
        String joined = String.join(", ", parts).replaceAll("\\s+", " ");
        return joined.length() > 500 ? joined.substring(0, 500) : joined;
    }

    /* ── 2단계: 이미지 생성(이미지 모델, 결제 키) ──────────────────────────────── */

    /**
     * 공통 앵커 v4 — IDENTITY/OUTFIT/FRAMING/STYLE 네 블록. STYLE 은 사용자 피드백("눈이 너무 정직하다,
     * 더 대두여도 된다, 더 캐릭터화하자")을 반영한 값(§12-4). 닮음은 IDENTITY FACTS 가 붙잡으므로 과장을
     * 세게 걸어도 된다.
     */
    static final String ANCHOR = String.join(" ",
            "Turn the MAIN person in this photo (the largest, centered face) into a cute chibi emoticon character.",
            "Ignore any other people partially visible at the edges of the photo.",
            "IDENTITY (most important): this must be recognizably the same person. Copy from the photo exactly:",
            "face shape, gender presentation, hairstyle and hair length (do NOT make the hair longer or shorter than in the photo),",
            "hair color, skin tone, eyebrows, glasses if any, facial hair if any,",
            "and every small distinctive mark such as moles or freckles at the same position.",
            "OUTFIT: draw the exact same clothing as in the photo (same garment type and color) in every image.",
            "FRAMING: upper body only (head and shoulders to chest), head centered, same size in every image.",
            "STYLE: strongly exaggerated chibi (super-deformed) proportions: the head is about half of the total height,",
            "very large expressive eyes with big shiny highlights (about twice the size of realistic eyes), tiny nose, small mouth,",
            "round soft cheeks. Simplified, playful cartoon like a Korean messenger emoticon, not a realistic portrait.",
            "Thick white sticker outline, clean bold dark lines, soft pastel shading, plain solid pure white (#FFFFFF) background, square composition.",
            "No text, no letters, no watermark, no speech bubbles.");

    static String imagePrompt(String identityFacts, CoupleEmojiEmotion emotion) {
        StringBuilder sb = new StringBuilder(ANCHOR);
        if (identityFacts != null && !identityFacts.isBlank()) {
            sb.append("\nIDENTITY FACTS (copy these exactly): ").append(identityFacts);
        }
        return sb.append("\nExpression: ").append(emotion.expressionPrompt()).append('.').toString();
    }
}
