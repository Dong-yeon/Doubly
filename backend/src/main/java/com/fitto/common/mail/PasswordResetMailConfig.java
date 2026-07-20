package com.fitto.common.mail;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.mail.javamail.JavaMailSender;

/**
 * 발송 구현 선택 — spring.mail.host 가 설정되면 SMTP, 아니면 개발용 로그 출력.
 *
 * <p>Spring Boot 의 메일 자동설정은 spring.mail.host 가 있을 때만 JavaMailSender 빈을 만든다.
 * 따라서 빈 존재 여부만 보고 결정하면 되고, 별도의 플래그 설정이 필요 없다.
 */
@Configuration
public class PasswordResetMailConfig {

    @Bean
    public PasswordResetMailSender passwordResetMailSender(ObjectProvider<JavaMailSender> mailSender,
                                                           ObjectProvider<MailProperties> mailProperties) {
        JavaMailSender sender = mailSender.getIfAvailable();
        MailProperties props = mailProperties.getIfAvailable();

        /*
         * host 가 빈 문자열인 경우까지 직접 확인한다.
         * application.yml 에서 ${MAIL_HOST:} 같은 형태로 기본값을 주면 프로퍼티가 "없음"이 아니라
         * "빈 값"으로 존재하게 되고, 그러면 스프링이 빈 호스트를 가진 JavaMailSender 를 만들어
         * 발송이 조용히 실패할 수 있다. 빈 값은 미설정과 동일하게 취급한다.
         */
        if (sender == null || props == null || props.getHost() == null || props.getHost().isBlank()) {
            return new LoggingPasswordResetMailSender();
        }
        return new SmtpPasswordResetMailSender(sender, props.getUsername());
    }
}
