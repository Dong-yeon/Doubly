package com.fitto.auth.service;

import com.fitto.auth.domain.PasswordResetToken;
import com.fitto.auth.repository.PasswordResetTokenRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.mail.PasswordResetMailSender;
import com.fitto.common.security.AuthRateLimiter;
import com.fitto.common.security.RefreshTokenStore;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 비밀번호 재설정 — AUTH-07 / AUTH-08.
 *
 * <p>설계 원칙:
 * <ul>
 *   <li><b>계정 존재 여부를 노출하지 않는다.</b> 코드 발송 요청은 가입 여부·소셜계정 여부·
 *       레이트리밋 초과와 무관하게 항상 동일한 성공 응답을 준다.</li>
 *   <li><b>코드 원문을 저장하지 않는다.</b> BCrypt 해시만 보관한다.</li>
 *   <li><b>1회용.</b> 사용 즉시 폐기되고, 재발급 시 이전 코드는 무효화된다.</li>
 *   <li><b>재설정 성공 시 전체 세션을 폐기한다.</b> 계정 탈취 상황에서 비밀번호만 바꾸고
 *       공격자의 리프레시 토큰이 살아있으면 의미가 없다.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    private static final Duration CODE_TTL = Duration.ofMinutes(10);
    private static final int CODE_BOUND = 1_000_000; // 6자리 (000000~999999)

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetMailSender mailSender;
    private final RefreshTokenStore refreshTokenStore;
    private final AuthRateLimiter rateLimiter;
    private final SecureRandom random = new SecureRandom();

    /**
     * 실패 기록 전용 트랜잭션.
     * 검증 실패 시 예외를 던지면 바깥 트랜잭션이 롤백되어 attempts 증가분이 사라진다
     * — 그러면 5회 제한이 무력화되고 6자리 코드를 무한 대입할 수 있다.
     * 실패 카운트만 독립 트랜잭션(REQUIRES_NEW)으로 즉시 커밋한다.
     */
    private final TransactionTemplate failureTx;

    /** 미가입 이메일에도 BCrypt 1회를 수행해 응답 시간을 균일화한다(가입 여부 추론 차단). */
    private final String timingDummyHash;

    public PasswordResetService(UserRepository userRepository,
                                PasswordResetTokenRepository tokenRepository,
                                PasswordEncoder passwordEncoder,
                                PasswordResetMailSender mailSender,
                                RefreshTokenStore refreshTokenStore,
                                AuthRateLimiter rateLimiter,
                                PlatformTransactionManager transactionManager) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.refreshTokenStore = refreshTokenStore;
        this.rateLimiter = rateLimiter;
        this.failureTx = new TransactionTemplate(transactionManager);
        this.failureTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.timingDummyHash = passwordEncoder.encode("timing-equalization-dummy");
    }

    /**
     * 인증코드 발송 요청 — AUTH-07.
     * 어떤 경우에도 예외를 던지지 않는다(레이트리밋 포함). 응답 차이로 가입 여부가 드러나지 않게 하기 위함이다.
     */
    @Transactional
    public void sendResetCode(String email, String clientIp) {
        boolean allowed = rateLimiter.allowForgotPassword(clientIp, email);
        User user = userRepository.findByEmail(email).orElse(null);

        if (!allowed) {
            // 한도 초과 — 조용히 건너뛴다(응답은 성공과 동일)
            log.warn("비밀번호 재설정 코드 발송 한도 초과: ip={}", clientIp);
            return;
        }
        if (user == null) {
            passwordEncoder.encode("timing-equalization-dummy"); // 응답 시간 균일화
            return;
        }
        if (!user.hasPassword()) {
            // 소셜 전용 계정 — 재설정할 비밀번호가 없다. 존재를 드러내지 않도록 조용히 종료.
            log.info("소셜 계정에 비밀번호 재설정 요청 — 무시: userId={}", user.getId());
            return;
        }

        // 이전에 발급된 미사용 코드는 모두 무효화 — 동시에 여러 코드가 살아있지 않게 한다
        List<PasswordResetToken> previous = tokenRepository.findUnusedByUser(user.getId());
        previous.forEach(PasswordResetToken::invalidate);

        String code = generateCode();
        tokenRepository.save(PasswordResetToken.builder()
                .userId(user.getId())
                .codeHash(passwordEncoder.encode(code))
                .expiresAt(LocalDateTime.now().plus(CODE_TTL))
                .build());

        mailSender.sendResetCode(user.getEmail(), user.getName(), code, CODE_TTL);
    }

    /**
     * 인증코드 검증 후 비밀번호 재설정 — AUTH-07.
     * 이메일 오류·코드 오류·만료를 모두 같은 에러로 응답해 유효한 조합을 좁힐 단서를 주지 않는다.
     */
    @Transactional
    public void resetPassword(String email, String code, String newPassword, String clientIp) {
        rateLimiter.checkResetPassword(clientIp, email);

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null || !user.hasPassword()) {
            passwordEncoder.matches(code, timingDummyHash);
            throw new BusinessException(ErrorCode.INVALID_RESET_CODE);
        }

        PasswordResetToken token = tokenRepository.findLatestUnused(user.getId()).orElse(null);
        if (token == null || token.isExpired()) {
            passwordEncoder.matches(code, timingDummyHash);
            throw new BusinessException(ErrorCode.INVALID_RESET_CODE);
        }
        if (token.isAttemptsExceeded()) {
            throw new BusinessException(ErrorCode.RESET_CODE_ATTEMPTS_EXCEEDED);
        }

        if (!passwordEncoder.matches(code, token.getCodeHash())) {
            recordFailedAttempt(token.getId());
            throw new BusinessException(ErrorCode.INVALID_RESET_CODE);
        }

        /*
         * 이전과 같은 비밀번호로의 재설정은 막는다 — 유출된 비밀번호를 그대로 두는 상황 방지.
         * 여기서는 실패 횟수를 세지 않는다. 코드 검증은 이미 통과했으므로 본인이 확실하고,
         * 새 비밀번호를 잘못 골랐다는 이유로 코드를 폐기하면 재발급을 강요하게 된다.
         */
        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.SAME_AS_CURRENT_PASSWORD);
        }

        token.markUsed();
        user.changePassword(passwordEncoder.encode(newPassword));

        // 재설정 시점의 모든 세션 폐기 — 탈취된 리프레시 토큰이 살아남지 않게 한다
        refreshTokenStore.revokeAll(user.getId());
        log.info("비밀번호 재설정 완료 — 전체 세션 폐기: userId={}", user.getId());
    }

    /**
     * 로그인 상태에서 비밀번호 변경 — AUTH-08. 현재 비밀번호 확인 필수.
     * 변경 후 전체 세션을 폐기하므로 호출자는 재로그인이 필요하다.
     */
    @Transactional
    public void changePassword(Long userId, String currentPassword, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (!user.hasPassword()) {
            throw new BusinessException(ErrorCode.PASSWORD_NOT_SET);
        }
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.SAME_AS_CURRENT_PASSWORD);
        }

        user.changePassword(passwordEncoder.encode(newPassword));
        // 발급 중인 재설정 코드가 있다면 함께 무효화 — 변경 직후 옛 코드로 되돌리지 못하게 한다
        tokenRepository.findUnusedByUser(userId).forEach(PasswordResetToken::invalidate);

        refreshTokenStore.revokeAll(userId);
        log.info("비밀번호 변경 완료 — 전체 세션 폐기: userId={}", userId);
    }

    // ---- helpers ----

    /**
     * 실패 카운트를 독립 트랜잭션으로 즉시 커밋한다.
     * 호출 직후 예외가 던져져 바깥 트랜잭션이 롤백되어도 이 증가분은 유지된다.
     */
    private void recordFailedAttempt(Long tokenId) {
        failureTx.executeWithoutResult(status ->
                tokenRepository.findById(tokenId).ifPresent(t -> {
                    t.recordFailedAttempt();
                    tokenRepository.save(t);
                }));
    }

    /** 6자리 인증코드 — 예측 불가하도록 SecureRandom 사용, 앞자리 0 보존. */
    private String generateCode() {
        return String.format("%06d", random.nextInt(CODE_BOUND));
    }
}
