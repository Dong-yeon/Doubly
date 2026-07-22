package com.fitto.common.mail;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 발송 구현 선택 검증.
 * application.yml 이 ${MAIL_HOST:} 형태로 기본값을 주면 프로퍼티가 "빈 값"으로 존재하게 되어
 * 스프링이 호스트 없는 JavaMailSender 를 만들 수 있다. 그 경우에도 SMTP 가 아니라
 * 개발용 로그 발송으로 떨어져야 한다 — 아니면 코드가 조용히 사라진다.
 */
class PasswordResetMailConfigTest {

    @SpringBootTest
    @ActiveProfiles("test")
    @TestPropertySource(properties = "spring.mail.host=")
    static class 호스트가_빈_문자열이면 {

        @Autowired
        PasswordResetMailSender sender;

        @Test
        void 개발용_로그_발송으로_폴백한다() {
            assertThat(sender).isInstanceOf(LoggingPasswordResetMailSender.class);
        }
    }

    @SpringBootTest
    @ActiveProfiles("test")
    static class 메일_설정이_없으면 {

        @Autowired
        PasswordResetMailSender sender;

        @Test
        void 개발용_로그_발송으로_폴백한다() {
            assertThat(sender).isInstanceOf(LoggingPasswordResetMailSender.class);
        }
    }

    @SpringBootTest
    @ActiveProfiles("test")
    @TestPropertySource(properties = {
            "spring.mail.host=smtp.example.com",
            "spring.mail.username=noreply@example.com"
    })
    static class 호스트가_설정되면 {

        @Autowired
        PasswordResetMailSender sender;

        @Test
        void SMTP_발송을_사용한다() {
            assertThat(sender).isInstanceOf(SmtpPasswordResetMailSender.class);
        }
    }

    /**
     * env 변수명(RESEND_API_KEY)으로 검증한다 — 프로퍼티명(fitto.resend.api-key)이 아니라.
     * application.yml 의 ${RESEND_API_KEY:} 배선이 빠지면 이 테스트가 실패한다.
     * (실제 운영에서 배선 누락으로 Resend 가 선택되지 않은 버그를 재발 방지)
     */
    @SpringBootTest
    @ActiveProfiles("test")
    @TestPropertySource(properties = "RESEND_API_KEY=re_test_key")
    static class RESEND_API_KEY_가_있으면 {

        @Autowired
        PasswordResetMailSender sender;

        @Test
        void Resend_발송을_사용한다() {
            assertThat(sender).isInstanceOf(ResendMailSender.class);
        }
    }

    /** Resend 와 SMTP 가 모두 설정되면 Resend 가 우선한다(PaaS 에서 SMTP 가 막히므로). */
    @SpringBootTest
    @ActiveProfiles("test")
    @TestPropertySource(properties = {
            "RESEND_API_KEY=re_test_key",
            "spring.mail.host=smtp.example.com"
    })
    static class Resend_와_SMTP_가_모두_있으면 {

        @Autowired
        PasswordResetMailSender sender;

        @Test
        void Resend_가_우선한다() {
            assertThat(sender).isInstanceOf(ResendMailSender.class);
        }
    }

    /**
     * 표시 이름이 없으면 수신함에 발신 계정 주소(예: 개인 Gmail)가 그대로 보여
     * 서비스가 보낸 메일로 읽히지 않는다.
     */
    @Nested
    class 발신자_표시이름 {

        @Test
        void 주소에_서비스명을_붙인다() {
            assertThat(SmtpPasswordResetMailSender.displayFrom("noreply@doubly.app"))
                    .isEqualTo("Doubly <noreply@doubly.app>");
        }

        @Test
        void 이미_표시이름이_있으면_그대로_둔다() {
            assertThat(SmtpPasswordResetMailSender.displayFrom("우리앱 <a@b.com>"))
                    .isEqualTo("우리앱 <a@b.com>");
        }

        @Test
        void 앞뒤_공백은_제거한다() {
            assertThat(SmtpPasswordResetMailSender.displayFrom("  noreply@doubly.app  "))
                    .isEqualTo("Doubly <noreply@doubly.app>");
        }

        @Test
        void 주소가_없으면_발신자를_지정하지_않는다() {
            assertThat(SmtpPasswordResetMailSender.displayFrom(null)).isNull();
            assertThat(SmtpPasswordResetMailSender.displayFrom("   ")).isNull();
        }
    }
}
