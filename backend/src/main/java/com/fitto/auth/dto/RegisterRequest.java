package com.fitto.auth.dto;

import com.fitto.user.domain.Gender;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/** 회원가입 요청 — 설계서 3.1 AUTH-03 */
public record RegisterRequest(
        @Email(message = "올바른 이메일 형식이 아닙니다.")
        @NotBlank(message = "이메일은 필수입니다.")
        String email,

        @NotBlank(message = "비밀번호는 필수입니다.")
        @Size(min = 8, max = 64, message = "비밀번호는 8자 이상이어야 합니다.")
        String password,

        @NotBlank(message = "이름은 필수입니다.")
        @Size(max = 50)
        String name,

        LocalDate birthDate,

        Gender gender,

        /*
         * 약관 동의 (AUTH-09).
         * 필수 두 항목은 @AssertTrue 로 강제한다 — 서버가 최종 관문이어야 하며,
         * 프론트 체크박스만으로는 API 직접 호출을 막을 수 없다.
         */
        @AssertTrue(message = "이용약관에 동의해야 가입할 수 있습니다.")
        boolean agreeTerms,

        @AssertTrue(message = "개인정보 수집·이용에 동의해야 가입할 수 있습니다.")
        boolean agreePrivacy,

        /** 마케팅 수신 — 선택 항목 */
        boolean agreeMarketing
) {
}
