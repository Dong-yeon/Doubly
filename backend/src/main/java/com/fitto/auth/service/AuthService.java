package com.fitto.auth.service;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UserResponse;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.diet.repository.MealRepository;
import com.fitto.notification.repository.DeviceTokenRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.security.AuthRateLimiter;
import com.fitto.common.security.JwtTokenProvider;
import com.fitto.common.security.RefreshTokenStore;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.streak.repository.StreakRepository;
import com.fitto.user.domain.Role;
import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.repository.WorkoutRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 인증 서비스 — 설계서 3.1 / 4.2.
 * 이메일 회원가입/로그인, 토큰 발급/갱신/회전, 로그아웃, 회원 탈퇴.
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final StreakRepository streakRepository;
    private final DeviceTokenRepository deviceTokenRepository;
    private final MealRepository mealRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshTokenStore;
    private final AuthRateLimiter rateLimiter;

    /**
     * 존재하지 않는 이메일 로그인 시에도 BCrypt 매칭을 수행해 응답 시간을 균일화한다
     * — 시간 차이로 가입 여부를 알아내는 타이밍 공격(enumeration) 방지.
     */
    private final String timingDummyHash;

    public AuthService(UserRepository userRepository,
                       RelationRepository relationRepository,
                       WorkoutRepository workoutRepository,
                       ChatMessageRepository chatMessageRepository,
                       StreakRepository streakRepository,
                       DeviceTokenRepository deviceTokenRepository,
                       MealRepository mealRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       RefreshTokenStore refreshTokenStore,
                       AuthRateLimiter rateLimiter) {
        this.userRepository = userRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.chatMessageRepository = chatMessageRepository;
        this.streakRepository = streakRepository;
        this.deviceTokenRepository = deviceTokenRepository;
        this.mealRepository = mealRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.refreshTokenStore = refreshTokenStore;
        this.rateLimiter = rateLimiter;
        this.timingDummyHash = passwordEncoder.encode("timing-equalization-dummy");
    }

    @Transactional
    public TokenResponse register(RegisterRequest request, String clientIp) {
        rateLimiter.checkRegister(clientIp);
        if (userRepository.existsByEmail(request.email())) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }
        User user = User.builder()
                .email(request.email())
                .password(passwordEncoder.encode(request.password()))
                .name(request.name())
                .birthDate(request.birthDate())
                .gender(request.gender())
                .role(Role.USER)
                .socialType(SocialType.EMAIL)
                .build();
        userRepository.save(user);
        return issueTokens(user);
    }

    public TokenResponse login(LoginRequest request, String clientIp) {
        rateLimiter.checkLogin(clientIp, request.email());

        User user = userRepository.findByEmail(request.email()).orElse(null);
        if (user == null || user.getPassword() == null) {
            // 미가입 이메일도 BCrypt 1회 수행 — 타이밍으로 가입 여부 판별 불가
            passwordEncoder.matches(request.password(), timingDummyHash);
            rateLimiter.recordLoginFailure(clientIp, request.email());
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            rateLimiter.recordLoginFailure(clientIp, request.email());
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }
        rateLimiter.resetLogin(clientIp, request.email());
        return issueTokens(user);
    }

    /**
     * Refresh Token 회전 재발급 — 설계서 4.2 POST /auth/refresh.
     * 사용된 리프레시 토큰은 즉시 폐기되고 새 토큰으로 교체된다(1회용).
     * 이미 소비된 토큰이 다시 오면 탈취 재사용으로 간주해 해당 사용자의 모든 세션을 폐기한다.
     */
    public TokenResponse refresh(String refreshToken, String clientIp) {
        rateLimiter.checkRefresh(clientIp);

        Claims claims = parseRefreshClaims(refreshToken);
        Long userId = Long.valueOf(claims.getSubject());

        String jti = claims.getId();
        if (jti != null) {
            RefreshTokenStore.ConsumeResult result = refreshTokenStore.consume(userId, jti);
            if (result == RefreshTokenStore.ConsumeResult.REUSED) {
                log.warn("리프레시 토큰 재사용 감지 — 전체 세션 폐기: userId={}", userId);
                refreshTokenStore.revokeAll(userId);
                throw new BusinessException(ErrorCode.INVALID_TOKEN);
            }
        }
        // jti 없는 토큰 = 회전 도입 이전 발급분 — 만료(최대 14일)까지만 허용되는 마이그레이션 경로.
        // 이번 갱신부터 jti 있는 토큰으로 교체된다.

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_TOKEN));
        return issueTokens(user);
    }

    /** 로그아웃 — 제시된 리프레시 토큰을 폐기한다(만료 전이라도 재사용 불가). */
    public void logout(String refreshToken) {
        Claims claims = parseRefreshClaims(refreshToken);
        String jti = claims.getId();
        if (jti != null) {
            refreshTokenStore.revoke(Long.valueOf(claims.getSubject()), jti);
        }
    }

    /** 현재 로그인 사용자 조회 — 클라이언트 콜드 스타트 시 프로필 복원용. */
    public UserResponse getMe(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        return UserResponse.from(user);
    }

    /** 프로필 수정 — 제공된 필드(이름/사진)만 반영. */
    @Transactional
    public UserResponse updateMe(Long userId, String name, String profileImageUrl) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        user.updateProfile(name, profileImageUrl);
        return UserResponse.from(user);
    }

    /** 회원 탈퇴 — 연결된 관계를 종료한 뒤 계정 삭제 (AUTH-06). */
    @Transactional
    public void withdraw(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        // 의존 데이터 정리 후 계정 삭제 (FK 순서: 메시지/스트릭 → 운동 → 관계 → 사용자)
        chatMessageRepository.deleteAllByUserRelations(userId);
        streakRepository.deleteAllByUserId(userId);
        streakRepository.deleteAllByUserRelations(userId);
        workoutRepository.deleteAllByUserId(userId);
        mealRepository.deleteAllByUserId(userId);
        deviceTokenRepository.deleteAllByUserId(userId);
        relationRepository.deleteAllByUser(userId);
        userRepository.delete(user);
        // 탈퇴 후에는 남은 리프레시 토큰으로 재로그인할 수 없도록 전부 폐기
        refreshTokenStore.revokeAll(userId);
    }

    // ---- helpers ----

    /** 리프레시 토큰 서명/만료/타입 검증 후 Claims 반환. */
    private Claims parseRefreshClaims(String refreshToken) {
        Claims claims;
        try {
            claims = tokenProvider.parse(refreshToken);
        } catch (JwtException | IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        if (!tokenProvider.isRefreshToken(claims)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        return claims;
    }

    private TokenResponse issueTokens(User user) {
        String access = tokenProvider.createAccessToken(user.getId(), user.getRole());
        String refresh = tokenProvider.createRefreshToken(user.getId());
        // 발급된 리프레시 토큰을 화이트리스트에 등록 — 회전/무효화의 기준점
        String jti = tokenProvider.parse(refresh).getId();
        refreshTokenStore.store(user.getId(), jti, tokenProvider.refreshTokenTtl());
        return new TokenResponse(access, refresh, UserResponse.from(user));
    }
}
