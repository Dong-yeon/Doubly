package com.fitto.common.mail;

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
}
