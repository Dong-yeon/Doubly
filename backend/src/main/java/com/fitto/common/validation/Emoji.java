package com.fitto.common.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 값이 이모지로만 이루어졌는지 검증한다.
 *
 * <p>길이만 제한하면 클라이언트가 임의의 짧은 문자열을 반응으로 저장할 수 있다.
 * null 과 빈 값은 통과시키므로 필수 여부는 {@code @NotBlank} 와 함께 쓴다.
 */
@Documented
@Constraint(validatedBy = EmojiValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface Emoji {

    String message() default "이모지만 사용할 수 있어요.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
