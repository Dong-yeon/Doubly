package com.fitto.auth.service;

import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 탈퇴 유예기간이 끝난 계정을 영구 삭제한다 (2026-09-30).
 *
 * <p>계정마다 별도 트랜잭션({@link AccountWithdrawalService#purgeIfDue})으로 지운다 —
 * 한 계정의 삭제가 FK 위반 등으로 실패해도 나머지 계정 삭제까지 되돌리지 않기 위해서다.
 * 실패한 계정은 예정 시각이 그대로라 다음 회차에 다시 시도된다.
 *
 * <p><b>다중 인스턴스에서도 안전</b>: purgeIfDue 가 사용자를 다시 읽어 확인하므로
 * 먼저 지운 쪽이 이기고 나머지는 아무것도 하지 않는다.
 */
@Component
public class AccountWithdrawalSweeper {

    private static final Logger log = LoggerFactory.getLogger(AccountWithdrawalSweeper.class);

    private final UserRepository userRepository;
    private final AccountWithdrawalService withdrawalService;

    public AccountWithdrawalSweeper(UserRepository userRepository,
                                    AccountWithdrawalService withdrawalService) {
        this.userRepository = userRepository;
        this.withdrawalService = withdrawalService;
    }

    /** 매시 15분 — 다른 정각 작업과 겹치지 않게 비켜 둔다. */
    @Scheduled(cron = "0 15 * * * *")
    public void sweep() {
        LocalDateTime now = LocalDateTime.now();
        int purged = 0;
        for (Long userId : userRepository.findIdsDueForWithdrawal(now)) {
            try {
                if (withdrawalService.purgeIfDue(userId, now)) purged++;
            } catch (RuntimeException e) {
                log.error("탈퇴 계정 삭제 실패 — 다음 회차에 재시도: userId={}", userId, e);
            }
        }
        if (purged > 0) {
            log.info("탈퇴 유예기간 종료 계정 {}건 삭제", purged);
        }
    }
}
