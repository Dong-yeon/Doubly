package com.fitto.auth.service;

import com.fitto.auth.repository.PasswordResetTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 만료된 비밀번호 재설정 코드 정리 — AUTH-07.
 *
 * <p>재설정 요청·비밀번호 변경마다 password_reset_tokens 에 행이 쌓인다.
 * 코드는 10분이면 만료되고 1회용이라, 만료 후에는 남겨둘 이유가 없다.
 * 정리하지 않으면 해시된 인증 자료가 사용자 id 와 함께 무한정 누적된다.
 *
 * <p><b>다중 인스턴스에서도 안전</b>: 만료 행 삭제는 멱등적이다. 여러 인스턴스가
 * 동시에 돌아도 같은 행을 지우려 할 뿐 부작용이 없어 분산 락이 필요 없다.
 */
@Component
public class PasswordResetTokenCleaner {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetTokenCleaner.class);

    private final PasswordResetTokenRepository tokenRepository;

    public PasswordResetTokenCleaner(PasswordResetTokenRepository tokenRepository) {
        this.tokenRepository = tokenRepository;
    }

    /** 매시 정각에 만료된 코드를 제거한다. */
    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void purgeExpired() {
        int removed = tokenRepository.deleteExpiredBefore(LocalDateTime.now());
        if (removed > 0) {
            log.info("만료된 비밀번호 재설정 코드 {}건 정리", removed);
        }
    }
}
