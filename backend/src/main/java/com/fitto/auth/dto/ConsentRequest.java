package com.fitto.auth.dto;

import jakarta.validation.constraints.AssertTrue;

/**
 * 필수 약관 재동의 — AUTH-09.
 * 개정된(또는 동의 이력이 없는) 현재 버전 약관에 다시 동의한다.
 * 가입과 마찬가지로 필수 두 항목은 서버가 최종 관문으로 강제한다.
 */
public record ConsentRequest(
        @AssertTrue(message = "이용약관에 동의해야 계속 이용할 수 있습니다.")
        boolean agreeTerms,

        @AssertTrue(message = "개인정보 수집·이용에 동의해야 계속 이용할 수 있습니다.")
        boolean agreePrivacy
) {
}
