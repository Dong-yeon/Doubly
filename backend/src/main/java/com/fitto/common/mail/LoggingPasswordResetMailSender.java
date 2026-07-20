package com.fitto.common.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;

/**
 * 개발용 폴백 — SMTP 가 설정되지 않았을 때 인증코드를 서버 로그로 출력한다.
 * 이메일 계정 없이도 재설정 흐름 전체를 테스트할 수 있다.
 *
 * <p><b>운영 배포 시 반드시 spring.mail.* 를 설정해야 한다.</b>
 * 이 구현이 활성화되면 코드가 서버 로그에 남으므로, 로그 접근 권한자가 임의 계정의
 * 비밀번호를 재설정할 수 있다. 기동 시 경고를 남기는 이유다.
 */
public class LoggingPasswordResetMailSender implements PasswordResetMailSender {

    private static final Logger log = LoggerFactory.getLogger(LoggingPasswordResetMailSender.class);

    public LoggingPasswordResetMailSender() {
        log.warn("""

                ============================================================
                 [보안 경고] SMTP 미설정 — 비밀번호 재설정 코드가 서버 로그로 출력됩니다.
                 개발 환경 전용입니다. 운영 배포 전 spring.mail.* 를 반드시 설정하세요.
                ============================================================""");
    }

    @Override
    public void sendResetCode(String toEmail, String name, String code, Duration validFor) {
        log.info("""

                ---------- [개발용] 비밀번호 재설정 코드 ----------
                 받는 사람 : {} ({})
                 인증코드   : {}
                 유효시간   : {}분
                ------------------------------------------------""",
                name, toEmail, code, validFor.toMinutes());
    }
}
