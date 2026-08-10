package com.fitto.auth.service;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UpdateProfileRequest;
import com.fitto.auth.dto.UserResponse;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.security.AuthRateLimiter;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.policy.PolicyVersion;
import com.fitto.common.security.JwtTokenProvider;
import com.fitto.common.security.RefreshTokenStore;
import com.fitto.user.domain.Role;
import com.fitto.user.domain.SocialType;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 인증 서비스 — 설계서 3.1 / 4.2.
 * 이메일 회원가입/로그인, 토큰 발급/갱신/회전, 로그아웃, 회원 탈퇴.
 */
@Service
@Transactional(readOnly = true)
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserRepository userRepository;
    private final UserDataPurger userDataPurger;
    private final CloudinaryImageDeleter imageDeleter;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider tokenProvider;
    private final RefreshTokenStore refreshTokenStore;
    private final AuthRateLimiter rateLimiter;
    private final GoogleTokenVerifier googleTokenVerifier;

    /**
     * 존재하지 않는 이메일 로그인 시에도 BCrypt 매칭을 수행해 응답 시간을 균일화한다
     * — 시간 차이로 가입 여부를 알아내는 타이밍 공격(enumeration) 방지.
     */
    private final String timingDummyHash;

    public AuthService(UserRepository userRepository,
                       UserDataPurger userDataPurger,
                       CloudinaryImageDeleter imageDeleter,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider tokenProvider,
                       RefreshTokenStore refreshTokenStore,
                       AuthRateLimiter rateLimiter,
                       GoogleTokenVerifier googleTokenVerifier) {
        this.userRepository = userRepository;
        this.userDataPurger = userDataPurger;
        this.imageDeleter = imageDeleter;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.refreshTokenStore = refreshTokenStore;
        this.rateLimiter = rateLimiter;
        this.googleTokenVerifier = googleTokenVerifier;
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
        // 동의 필수 여부는 RegisterRequest 의 @AssertTrue 가 이미 검증했다.
        user.agreeToRequiredTerms(PolicyVersion.TERMS, PolicyVersion.PRIVACY);
        user.setMarketingConsent(request.agreeMarketing());
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
     * 구글 로그인 — AUTH-11. 검증된 ID 토큰으로 로그인하거나 계정을 만든다.
     *
     * <p>조회 순서: (1) 구글 sub 로 기존 소셜 계정 → (2) 같은 이메일의 기존 계정
     * (인증된 이메일이므로 소유 증명으로 간주하고 로그인 — 계정이 이메일/구글로 갈라지지 않게)
     * → (3) 신규 생성. 신규 소셜 가입자는 약관 동의 이력이 없으므로
     * {@code requiresConsent=true} 로 내려가 재동의 게이트가 동의를 받는다.
     */
    @Transactional
    public TokenResponse googleLogin(String idToken, String clientIp) {
        rateLimiter.checkRefresh(clientIp);   // 토큰 검증 남용 방지 — 갱신과 같은 완만한 한도
        GoogleTokenVerifier.GoogleProfile profile = googleTokenVerifier.verify(idToken);

        User user = userRepository
                .findBySocialTypeAndSocialId(SocialType.GOOGLE, profile.sub())
                .or(() -> userRepository.findByEmail(profile.email()))
                .orElse(null);
        if (user == null) {
            String name = profile.name() != null && !profile.name().isBlank()
                    ? profile.name() : "사용자";
            user = userRepository.save(User.builder()
                    .email(profile.email())
                    .name(name.length() > 50 ? name.substring(0, 50) : name)
                    .profileImageUrl(profile.picture())
                    .role(Role.USER)
                    .socialType(SocialType.GOOGLE)
                    .socialId(profile.sub())
                    .build());
        }
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

    /** 프로필 수정 — 제공된 필드(이름/사진/생년월일/성별/키)만 반영. */
    @Transactional
    public UserResponse updateMe(Long userId, UpdateProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        user.updateProfile(request.name(), request.profileImageUrl());
        user.updateBodyProfile(request.birthDate(), request.gender(), request.heightCm());
        return UserResponse.from(user);
    }

    /**
     * 필수 약관 재동의 — AUTH-09. 약관 개정(버전 불일치) 또는 동의 이력이 없는
     * 기존 가입자가 현재 버전에 다시 동의한다. 동의 여부는 ConsentRequest 가 이미 검증했다.
     */
    @Transactional
    public UserResponse agreeToCurrentTerms(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        user.agreeToRequiredTerms(PolicyVersion.TERMS, PolicyVersion.PRIVACY);
        return UserResponse.from(user);
    }

    /** 마케팅 수신 동의/철회 — AUTH-09. 선택 동의이므로 언제든 되돌릴 수 있어야 한다. */
    @Transactional
    public UserResponse updateMarketingConsent(Long userId, boolean agreed) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        user.setMarketingConsent(agreed);
        return UserResponse.from(user);
    }

    /** 푸시 알림 수신 설정 — SET-01. 끄면 모든 푸시가 발송되지 않는다. */
    @Transactional
    public UserResponse updateNotificationSetting(Long userId, boolean enabled) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        user.setNotificationsEnabled(enabled);
        return UserResponse.from(user);
    }

    /** 회원 탈퇴 — 연결된 관계를 종료한 뒤 계정 삭제 (AUTH-06). */
    @Transactional
    public void withdraw(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        // 의존 데이터 정리 — 삭제 순서와 대상은 UserDataPurger 에 모여 있다.
        // (커플 콘텐츠까지 지우지 않으면 relations 삭제가 외래키 위반으로 실패한다)
        List<String> imageUrls = userDataPurger.purgeFor(userId);
        userRepository.delete(user);
        // 업로드된 이미지는 커밋 이후에 지운다 — DB 롤백이 나도 파일은 되돌릴 수 없기 때문
        imageDeleter.deleteAllAfterCommit(imageUrls);
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
