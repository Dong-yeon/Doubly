package com.fitto.common.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.JwtAuthenticationFilter;
import com.fitto.common.security.JwtTokenProvider;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 보안 설정 — 설계서 4.1 / 6.2.
 * 무상태(JWT) 기반, 메서드 보안(@PreAuthorize) 활성화, JWT 필터로 인증 컨텍스트 구성.
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtTokenProvider tokenProvider;
    private final CorsProperties corsProperties;
    private final ObjectMapper objectMapper;

    public SecurityConfig(JwtTokenProvider tokenProvider, CorsProperties corsProperties,
                          ObjectMapper objectMapper) {
        this.tokenProvider = tokenProvider;
        this.corsProperties = corsProperties;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .cors(Customizer.withDefaults())
                .csrf(csrf -> csrf.disable())
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 공개 엔드포인트 (설계서 4.2: 로그인/회원가입/토큰갱신 인증 불필요)
                        .requestMatchers(
                                // 구글 로그인 — 최초 로그인/가입 시점엔 아직 JWT가 없으므로
                                // 다른 소셜 로그인(kakao/apple)과 마찬가지로 공개 처리한다.
                                // AuthController#googleLogin(POST /api/v1/auth/google) 참고.
                                "/api/v1/auth/google",
                                "/api/v1/auth/kakao",
                                "/api/v1/auth/apple",
                                "/api/v1/auth/login",
                                "/api/v1/auth/register",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/logout",
                                // 비밀번호 재설정 — 로그인할 수 없는 상태에서 쓰는 기능이므로 공개
                                // (/auth/password/change 는 로그인 상태 전용이라 제외)
                                "/api/v1/auth/password/forgot",
                                "/api/v1/auth/password/reset",
                                "/api/v1/health",
                                // 스토어(Google Play RTDN)가 직접 호출 — 사용자 JWT가 없다.
                                // 발신자 확인은 GooglePlayWebhookController 내부의 공유 비밀
                                // 토큰(?token=)이 담당한다.
                                "/api/v1/webhooks/google-play",
                                "/ws/**")
                        .permitAll()
                        /*
                         * 운영 지표는 ADMIN 만 본다. 커넥션 풀 사용량·외부 호출 지연 같은 값은
                         * 서비스 내부 사정이라 일반 사용자 토큰으로 열리면 안 되고, 반대로
                         * 완전히 막아두면 정작 볼 사람이 못 본다(Railway 는 포트를 하나만
                         * 공개해서 관리 포트를 따로 여는 방법도 못 쓴다).
                         */
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        // /auth/me, /auth/withdraw 등 그 외 모든 요청은 인증 필요
                        .anyRequest().authenticated())
                /*
                 * 인증/인가 실패 응답 — 설정하지 않으면 스프링 기본값(Http403ForbiddenEntryPoint)이
                 * 본문 없는 403 을 준다. 그러면 (1) 클라이언트가 만료를 401 로 인식하지 못해
                 * 리프레시 토큰이 멀쩡한데도 자동 갱신을 못 하고, (2) 본문이 없어 사용자에게
                 * axios 원문("Request failed with status code 403")이 노출된다.
                 * 토큰 만료·누락 → 401, 권한 부족 → 403 을 ApiResponse 형식으로 내려준다.
                 */
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) ->
                                writeError(response, ErrorCode.UNAUTHORIZED))
                        .accessDeniedHandler((request, response, deniedException) ->
                                writeError(response, ErrorCode.FORBIDDEN)))
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider),
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** 필터 단계의 오류를 컨트롤러와 같은 ApiResponse 형식으로 직렬화한다. */
    private void writeError(HttpServletResponse response, ErrorCode code) throws IOException {
        response.setStatus(code.getStatus().value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        objectMapper.writeValue(response.getWriter(),
                ApiResponse.error(code.getMessage(), code.name()));
    }

    /**
     * CORS — fitto.cors.allowed-origins 로 허용 출처를 제어한다.
     * 개발 기본값은 "*", 운영(prod)은 CORS_ALLOWED_ORIGINS 환경변수로 웹 배포 도메인만 허용.
     * 인증은 Authorization 헤더(JWT)로만 하므로 쿠키 자격증명은 차단한다.
     *
     * <p><b>{@code /ws/**} 는 여기 등록하지 않는다</b> — 예전엔 등록돼 있었는데, React
     * Native 안드로이드의 WebSocket 이 {@code wss://host} 에서 {@code Origin: https://host}
     * 를 자동으로 붙여 보내는 바람에, 그 Origin 이 브라우저용 화이트리스트(웹 배포 도메인만
     * 들어있음)에 없어 핸드셰이크가 403 으로 거부됐다 — 웹은 되고 안드로이드 채팅 전송만
     * "연결이 끊겼어요"로 실패하던 원인이었다(logcat 으로 재현: onWebSocketClose code 1006,
     * reason "Expected HTTP 101 response but was '403 Forbidden'"). WebSocketConfig 가
     * {@code /ws/chat} 자체에 이미 {@code setAllowedOriginPatterns("*")} 로 origin 을 열어
     * 두고 STOMP CONNECT 의 JWT 로 인증하므로, 여기서 브라우저 CORS 화이트리스트를 얹는 건
     * 중복 방어가 아니라 상충하는 두 번째 게이트였다.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(corsProperties.effectiveAllowedOrigins());
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(false);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
