package com.fitto.body;

import com.fitto.body.dto.SaveBodyMetricRequest;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/** 오타 값이 DB 정밀도를 넘어 500 이 되기 전에 400 으로 막히는가 — 스프링 컨텍스트 없이 검증만. */
class SaveBodyMetricRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private static SaveBodyMetricRequest of(String weight, String fat, String waist) {
        return new SaveBodyMetricRequest(null,
                weight == null ? null : new BigDecimal(weight),
                fat == null ? null : new BigDecimal(fat),
                waist == null ? null : new BigDecimal(waist),
                null, null);
    }

    @Test
    void 사람의_값은_통과한다() {
        assertThat(validator.validate(of("62.5", "24.3", "78"))).isEmpty();
        assertThat(validator.validate(of("62.5", null, null))).isEmpty();
    }

    @Test
    void 오타로_커진_체중은_막는다() {
        assertThat(validator.validate(of("6250", null, null)))
                .extracting(v -> v.getMessage())
                .containsExactly("체중은 20~300kg 사이로 입력해주세요.");
    }

    @Test
    void 영_킬로그램과_범위_밖_체지방률은_막는다() {
        assertThat(validator.validate(of("0", null, null))).hasSize(1);
        assertThat(validator.validate(of("60", "243", null))).hasSize(1);
    }
}
