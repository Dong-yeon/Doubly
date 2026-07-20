package com.fitto.common.validation;

import com.fitto.feed.dto.ReactRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 리액션 이모지 검증.
 *
 * <p>이전에는 {@code @NotBlank + @Size(max=10)} 뿐이라 10자 이내면 어떤 문자열이든
 * 반응으로 저장됐다.
 */
@SpringBootTest
@ActiveProfiles("test")
class EmojiValidationTest {

    @Autowired
    Validator validator;

    private Set<ConstraintViolation<ReactRequest>> validate(String emoji) {
        return validator.validate(new ReactRequest(emoji));
    }

    /** 앱이 실제로 보내는 기본 반응 세트. */
    @ParameterizedTest
    @ValueSource(strings = {"❤️", "🥰", "😆", "👍", "💪", "🔥", "🎉", "💗"})
    void 앱_기본_이모지는_통과한다(String emoji) {
        assertThat(validate(emoji)).isEmpty();
    }

    /** 원래 문제 — 이모지가 아닌 문자열이 반응으로 저장되던 경로. */
    @ParameterizedTest
    @ValueSource(strings = {
            "hello",
            "ㅋㅋㅋ",
            "12345",
            "<script>",
            "'; drop--",
            "   .   ",
            "a👍"          // 이모지가 섞여 있어도 글자가 있으면 거부
    })
    void 이모지가_아니면_거부한다(String value) {
        assertThat(validate(value))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("emoji");
    }

    @Test
    void 피부톤과_변형선택자가_붙어도_통과한다() {
        assertThat(validate("👍🏽")).isEmpty();   // 피부톤 modifier
        assertThat(validate("❤️")).isEmpty(); // 변형 선택자
    }

    /**
     * 짧은 ZWJ 결합 이모지는 통과한다 (커플 이모지 = UTF-16 8자).
     */
    @Test
    void 짧은_ZWJ_결합_이모지는_통과한다() {
        String couple = "👩‍❤️‍👨";
        assertThat(couple.length()).isLessThanOrEqualTo(10);
        assertThat(validate(couple)).isEmpty();
    }

    /**
     * 긴 ZWJ 결합은 @Size 에서 걸린다 (가족 4인 = UTF-16 11자).
     *
     * <p>참고: {@code @Size} 는 UTF-16 단위, Postgres {@code VARCHAR(10)} 은 코드포인트
     * 단위로 센다. UTF-16 길이 ≥ 코드포인트 수이므로 Java 검증이 항상 더 엄격하고,
     * 따라서 검증을 통과한 값이 컬럼 폭을 넘는 일은 발생하지 않는다.
     */
    @Test
    void 긴_ZWJ_결합_이모지는_길이_제한에_걸린다() {
        String family = "👨‍👩‍👧‍👦";
        assertThat(family.length()).isGreaterThan(10);
        assertThat(validate(family)).isNotEmpty();
    }

    @Test
    void 빈_값은_NotBlank_가_잡는다() {
        assertThat(validate("  "))
                .extracting(v -> v.getPropertyPath().toString())
                .contains("emoji");
    }
}
