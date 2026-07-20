package com.fitto.common.mail;

import java.time.Duration;

/**
 * 비밀번호 재설정 인증코드 발송 채널.
 * SMTP 설정(spring.mail.host) 유무에 따라 구현체가 자동 선택된다 — {@link PasswordResetMailConfig}.
 */
public interface PasswordResetMailSender {

    /**
     * 인증코드를 사용자에게 전달한다.
     * 발송 실패가 호출자에게 전파되면 "메일이 안 가면 계정 존재 여부가 드러나는" 문제가 생기므로,
     * 구현체는 예외를 밖으로 던지지 않고 내부에서 로깅으로 처리한다.
     */
    void sendResetCode(String toEmail, String name, String code, Duration validFor);
}
