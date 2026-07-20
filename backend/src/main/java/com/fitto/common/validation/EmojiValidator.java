package com.fitto.common.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

/**
 * 문자열이 이모지(및 이모지 조합용 문자)로만 이루어졌는지 검사한다.
 *
 * <p><b>왜 직접 구현했나</b>: {@code Character.isEmoji()} 는 Java 21 부터 제공되지만,
 * 로컬 검증을 17 로도 돌리고 있어 코드포인트 범위로 직접 판정한다.
 *
 * <p>완전한 유니코드 이모지 명세 구현이 아니라 <b>임의 텍스트 차단</b>이 목적이다.
 * 글자·숫자·공백·따옴표 같은 입력을 막는 선에서 충분하며, 경계상의 기호가 몇 개
 * 통과하더라도 보안상 문제가 되지 않는다.
 */
public class EmojiValidator implements ConstraintValidator<Emoji, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        // 필수 여부는 @NotBlank 의 몫 — 여기서는 값이 있을 때만 형식을 본다
        if (value == null || value.isBlank()) {
            return true;
        }
        return value.codePoints().allMatch(EmojiValidator::isEmojiCodePoint);
    }

    private static boolean isEmojiCodePoint(int cp) {
        return isEmojiBase(cp) || isEmojiModifier(cp);
    }

    /** 이모지 본체로 쓰이는 코드포인트 범위. */
    private static boolean isEmojiBase(int cp) {
        return cp == 0x00A9 || cp == 0x00AE                    // © ®
                || (cp >= 0x203C && cp <= 0x2049)              // ‼ ⁉
                || cp == 0x2122 || cp == 0x2139                // ™ ℹ
                || (cp >= 0x2194 && cp <= 0x21AA)              // 화살표
                || (cp >= 0x231A && cp <= 0x231B)              // ⌚ ⌛
                || cp == 0x2328
                || (cp >= 0x23CF && cp <= 0x23FA)              // 미디어 기호
                || cp == 0x24C2
                || (cp >= 0x25AA && cp <= 0x25FE)              // 도형
                || (cp >= 0x2600 && cp <= 0x27BF)              // 기타 기호 + 딩벳
                || (cp >= 0x2934 && cp <= 0x2935)
                || (cp >= 0x2B00 && cp <= 0x2BFF)
                || cp == 0x3030 || cp == 0x303D
                || cp == 0x3297 || cp == 0x3299
                || (cp >= 0x1F000 && cp <= 0x1FAFF);           // 주요 이모지 평면
    }

    /**
     * 이모지를 꾸미거나 잇는 문자 — 단독으로는 의미가 없지만 조합에 반드시 필요하다.
     * (변형 선택자, ZWJ, 피부톤, 키캡, 지역 표시자, 태그)
     */
    private static boolean isEmojiModifier(int cp) {
        return cp == 0xFE0F                                    // 변형 선택자 VS16
                || cp == 0x200D                                // ZWJ (가족 이모지 등 결합)
                || cp == 0x20E3                                // 키캡
                || (cp >= 0x1F3FB && cp <= 0x1F3FF)            // 피부톤
                || (cp >= 0x1F1E6 && cp <= 0x1F1FF)            // 국기(지역 표시자)
                || (cp >= 0xE0020 && cp <= 0xE007F);           // 태그 시퀀스
    }
}
