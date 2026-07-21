package com.fitto.common.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * 발송 구현 선택 — 우선순위: Resend(HTTP) → SMTP → 개발용 로그 출력.
 *
 * <p>Resend 를 먼저 보는 이유: Railway 같은 PaaS 는 아웃바운드 SMTP(587)를 막아
 * Gmail SMTP 가 닿지 못한다. Resend 는 HTTPS(443)로 발송하므로 그 환경에서도 동작한다.
 * SMTP 설정은 SMTP 가 열린 환경을 위해 폴백으로 남겨둔다.
 */
@Configuration
public class PasswordResetMailConfig {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetMailConfig.class);

    @Bean
    public PasswordResetMailSender passwordResetMailSender(ResendProperties resendProperties,
                                                           ObjectProvider<JavaMailSender> mailSender,
                                                           ObjectProvider<MailProperties> mailProperties) {
        if (resendProperties.isConfigured()) {
            log.info("비밀번호 재설정 메일: Resend(HTTP) 발송 사용");
            return new ResendMailSender(resendProperties);
        }

        JavaMailSender sender = mailSender.getIfAvailable();
        MailProperties props = mailProperties.getIfAvailable();
        /*
         * host 가 빈 문자열인 경우까지 직접 확인한다.
         * application.yml 에서 ${MAIL_HOST:} 같은 형태로 기본값을 주면 프로퍼티가 "없음"이 아니라
         * "빈 값"으로 존재하게 되고, 그러면 스프링이 빈 호스트를 가진 JavaMailSender 를 만들어
         * 발송이 조용히 실패할 수 있다. 빈 값은 미설정과 동일하게 취급한다.
         */
        if (sender != null && props != null && props.getHost() != null && !props.getHost().isBlank()) {
            log.info("비밀번호 재설정 메일: SMTP 발송 사용");
            return new SmtpPasswordResetMailSender(sender, props.getUsername());
        }
        return new LoggingPasswordResetMailSender();
    }
}
