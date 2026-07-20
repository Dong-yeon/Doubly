package com.fitto.common.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

import java.time.Duration;

/**
 * SMTP 발송 구현 — spring.mail.host 가 설정되면 활성화된다.
 */
public class SmtpPasswordResetMailSender implements PasswordResetMailSender {

    private static final Logger log = LoggerFactory.getLogger(SmtpPasswordResetMailSender.class);

    private final JavaMailSender mailSender;
    private final String from;

    public SmtpPasswordResetMailSender(JavaMailSender mailSender, String from) {
        this.mailSender = mailSender;
        this.from = from;
    }

    @Override
    public void sendResetCode(String toEmail, String name, String code, Duration validFor) {
        SimpleMailMessage message = new SimpleMailMessage();
        if (from != null && !from.isBlank()) {
            message.setFrom(from);
        }
        message.setTo(toEmail);
        message.setSubject("[Doubly] 비밀번호 재설정 인증코드");
        message.setText("""
                %s님, 안녕하세요.

                비밀번호 재설정 인증코드는 아래 6자리입니다.

                    %s

                앱의 인증코드 입력 화면에 %d분 안에 입력해주세요.

                본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.
                비밀번호는 변경되지 않으며, 코드만으로는 계정에 접근할 수 없습니다.

                — Doubly
                """.formatted(name, code, validFor.toMinutes()));

        try {
            mailSender.send(message);
        } catch (MailException e) {
            // 호출자에게 전파하면 응답 성공/실패로 계정 존재 여부가 드러난다 — 로깅만 하고 삼킨다.
            log.error("비밀번호 재설정 메일 발송 실패: {}", e.getMessage());
        }
    }
}
