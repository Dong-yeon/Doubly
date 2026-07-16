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
                                "/api/v1/auth/kakao",
                                "/api/v1/auth/apple",
                                "/api/v1/auth/login",
                                "/api/v1/auth/register",
                                "/api/v1/auth/refresh",
                                "/api/v1/auth/logout",
                                "/api/v1/health",
                                "/ws/**")
                        .permitAll()
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
        source.registerCorsConfiguration("/ws/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
