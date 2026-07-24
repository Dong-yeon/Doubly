package com.fitto.auth;

import com.fitto.auth.dto.ConsentRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.UserResponse;
import com.fitto.auth.service.AuthService;
import com.fitto.common.policy.PolicyVersion;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 약관 동의 검증 (AUTH-09) — H2 기반.
 */
@SpringBootTest
@ActiveProfiles("test")
class ConsentFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired
    AuthService authService;

    @Autowired
    UserRepository userRepository;

    @Autowired
    Validator validator;

    private RegisterRequest req(String email, boolean terms, boolean privacy, boolean marketing) {
        return new RegisterRequest(email, "password123", "테스터", null, null, terms, privacy, marketing);
    }

    @Test
    void 가입하면_동의시각과_약관버전이_기록된다() {
        UserResponse res = authService.register(req("consent-ok@fitto.com", true, true, false), IP).user();

        User saved = userRepository.findById(res.id()).orElseThrow();
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getPrivacyAgreedAt()).isNotNull();
        assertThat(saved.getTermsVersion()).isEqualTo(PolicyVersion.TERMS);
        assertThat(saved.getPrivacyVersion()).isEqualTo(PolicyVersion.PRIVACY);
        assertThat(saved.hasAgreedTo(PolicyVersion.TERMS, PolicyVersion.PRIVACY)).isTrue();
    }

    @Test
    void 마케팅_미동의로_가입하면_동의시각이_없다() {
        UserResponse res = authService.register(req("consent-nomkt@fitto.com", true, true, false), IP).user();

        assertThat(res.marketingConsent()).isFalse();
        assertThat(userRepository.findById(res.id()).orElseThrow().getMarketingAgreedAt()).isNull();
    }

    @Test
    void 마케팅_동의는_철회하고_다시_동의할_수_있다() {
        Long id = authService.register(req("consent-mkt@fitto.com", true, true, true), IP).user().id();
        assertThat(userRepository.findById(id).orElseThrow().hasMarketingConsent()).isTrue();

        assertThat(authService.updateMarketingConsent(id, false).marketingConsent()).isFalse();
        assertThat(authService.updateMarketingConsent(id, true).marketingConsent()).isTrue();
    }

    /**
     * 프론트 체크박스만으로는 API 직접 호출을 막을 수 없다.
     * 필수 동의 누락은 서버(@AssertTrue)에서 걸러져야 한다.
     */
    @Test
    void 필수_동의를_빠뜨리면_검증에_걸린다() {
        Set<ConstraintViolation<RegisterRequest>> noTerms =
                validator.validate(req("x@fitto.com", false, true, false));
        Set<ConstraintViolation<RegisterRequest>> noPrivacy =
                validator.validate(req("x@fitto.com", true, false, false));
        Set<ConstraintViolation<RegisterRequest>> ok =
                validator.validate(req("x@fitto.com", true, true, false));

        assertThat(noTerms).extracting(v -> v.getPropertyPath().toString()).contains("agreeTerms");
        assertThat(noPrivacy).extracting(v -> v.getPropertyPath().toString()).contains("agreePrivacy");
        assertThat(ok).isEmpty();
    }

    /**
     * 약관이 개정되면 버전이 달라져 재동의 대상으로 판별되어야 한다.
     * 기존 가입자(동의 이력 NULL)도 마찬가지로 재동의 대상이다.
     */
    @Test
    void 약관이_개정되면_재동의_대상이_된다() {
        Long id = authService.register(req("consent-ver@fitto.com", true, true, false), IP).user().id();
        User user = userRepository.findById(id).orElseThrow();

        assertThat(user.hasAgreedTo(PolicyVersion.TERMS, PolicyVersion.PRIVACY)).isTrue();
        assertThat(user.hasAgreedTo("2.0", PolicyVersion.PRIVACY)).isFalse();
        assertThat(user.hasAgreedTo(PolicyVersion.TERMS, "2.0")).isFalse();
    }

    @Test
    void 가입_직후에는_재동의가_필요없다() {
        UserResponse res = authService.register(req("consent-fresh@fitto.com", true, true, false), IP).user();

        assertThat(res.requiresConsent()).isFalse();
        assertThat(authService.getMe(res.id()).requiresConsent()).isFalse();
    }

    /**
     * 재동의 게이트 — V23 이전 가입자는 동의 이력이 NULL 이라 requiresConsent 가 true 로
     * 내려가고, 재동의 API 호출로 현재 버전이 기록되면 게이트가 풀려야 한다.
     */
    @Test
    void 동의_이력이_없는_기존_가입자는_재동의_후_게이트가_풀린다() {
        // User.builder() 는 동의 필드를 채우지 않는다 — V23 이전 가입자와 동일한 상태
        User legacy = userRepository.save(User.builder()
                .email("consent-legacy@fitto.com")
                .password("encoded")
                .name("기존가입자")
                .build());

        assertThat(authService.getMe(legacy.getId()).requiresConsent()).isTrue();

        UserResponse agreed = authService.agreeToCurrentTerms(legacy.getId());

        assertThat(agreed.requiresConsent()).isFalse();
        User saved = userRepository.findById(legacy.getId()).orElseThrow();
        assertThat(saved.getTermsAgreedAt()).isNotNull();
        assertThat(saved.getPrivacyAgreedAt()).isNotNull();
        assertThat(saved.getTermsVersion()).isEqualTo(PolicyVersion.TERMS);
        assertThat(saved.getPrivacyVersion()).isEqualTo(PolicyVersion.PRIVACY);
    }

    /** 재동의 요청도 가입과 동일하게 필수 두 항목이 모두 true 여야 한다. */
    @Test
    void 재동의_요청에서_필수_동의를_빠뜨리면_검증에_걸린다() {
        Set<ConstraintViolation<ConsentRequest>> noTerms =
                validator.validate(new ConsentRequest(false, true));
        Set<ConstraintViolation<ConsentRequest>> noPrivacy =
                validator.validate(new ConsentRequest(true, false));
        Set<ConstraintViolation<ConsentRequest>> ok =
                validator.validate(new ConsentRequest(true, true));

        assertThat(noTerms).extracting(v -> v.getPropertyPath().toString()).contains("agreeTerms");
        assertThat(noPrivacy).extracting(v -> v.getPropertyPath().toString()).contains("agreePrivacy");
        assertThat(ok).isEmpty();
    }
}
