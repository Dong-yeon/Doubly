package com.fitto.auth.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 구글 ID 토큰 검증 — AUTH-11 (구글 로그인).
 *
 * <p>서명 검증은 구글의 tokeninfo 엔드포인트에 위임한다(만료·서명 오류면 4xx 응답).
 * 우리는 그 결과에서 (1) aud 가 우리 클라이언트 id 인지, (2) 이메일이 인증됐는지만
 * 추가로 확인한다 — aud 를 안 보면 다른 앱용으로 발급된 토큰으로도 로그인된다.
 *
 * <p>GOOGLE_CLIENT_IDS 미설정 시 기능 비활성(SOCIAL_LOGIN_NOT_CONFIGURED) —
 * Gemini 미설정과 같은 방식의 선택 기능이다.
 */
@Component
public class GoogleTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleTokenVerifier.class);
    private static final String TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

    private final List<String> clientIds;
    private final RestClient restClient;

    public GoogleTokenVerifier(@Value("${fitto.google-auth.client-ids:}") String clientIdsCsv) {
        this.clientIds = Arrays.stream(clientIdsCsv.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** 검증된 구글 프로필 — sub 는 구글측 사용자 고유 id 로, 이메일 변경에도 불변이다. */
    public record GoogleProfile(String sub, String email, String name, String picture) {
    }

    public boolean isConfigured() {
        return !clientIds.isEmpty();
    }

    @SuppressWarnings("unchecked")
    public GoogleProfile verify(String idToken) {
        if (!isConfigured()) {
            throw new BusinessException(ErrorCode.SOCIAL_LOGIN_NOT_CONFIGURED);
        }
        Map<String, Object> claims;
        try {
            claims = restClient.get()
                    .uri(TOKENINFO_URL + "?id_token={token}", idToken)
                    .retrieve()
                    .body(Map.class);
        } catch (Exception e) {
            // 만료·위조 토큰은 구글이 4xx 로 거절한다 — 상세는 로그만 남기고 동일하게 응답
            log.warn("구글 토큰 검증 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        if (claims == null || !clientIds.contains(String.valueOf(claims.get("aud")))) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        String email = (String) claims.get("email");
        // 이메일이 계정 식별자다 — 미인증 이메일을 믿으면 남의 이메일 계정에 연결될 수 있다
        if (email == null || !"true".equals(String.valueOf(claims.get("email_verified")))) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }
        return new GoogleProfile(
                String.valueOf(claims.get("sub")),
                email,
                (String) claims.get("name"),
                (String) claims.get("picture"));
    }
}
