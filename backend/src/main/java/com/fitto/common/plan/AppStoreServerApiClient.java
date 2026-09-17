package com.fitto.common.plan;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.AppStoreProperties;
import io.jsonwebtoken.Jwts;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Date;
import java.util.List;

/**
 * App Store Server API 로 구독의 진짜 상태를 조회한다.
 *
 * <p>{@link GooglePlayDeveloperApiClient} 와 같은 자리다. 알림(Server Notifications V2)은
 * "뭔가 바뀌었다"는 신호일 뿐이므로 실제 상태는 항상 이 API 를 다시 불러 확정한다.
 * <b>그래서 알림 본문의 JWS 서명을 직접 검증하지 않아도 된다</b> — 알림에서 꺼내는 것은
 * 거래 id 하나뿐이고, 그 id 로 애플에게 직접 되묻기 때문이다(가짜 알림이 와도 애플이
 * "그런 거래 없음"이라고 답한다).
 *
 * <p>키가 없으면(스토어 등록 전) {@link #fetch} 는 {@code null} 을 돌려준다 —
 * 호출부가 그 경우를 조용히 건너뛴다.
 */
@Component
public class AppStoreServerApiClient {

    private static final Logger log = LoggerFactory.getLogger(AppStoreServerApiClient.class);

    private static final String PRODUCTION_HOST = "https://api.storekit.itunes.apple.com";
    private static final String SANDBOX_HOST = "https://api.storekit-sandbox.itunes.apple.com";
    /** 애플이 "그 거래를 모른다"고 답하는 코드 — 프로덕션에서 이게 오면 샌드박스 거래다. */
    private static final long TRANSACTION_NOT_FOUND = 4040010L;
    /** 토큰 수명. 애플 상한은 60분이지만 짧게 잡아 재사용 위험을 줄인다. */
    private static final Duration TOKEN_TTL = Duration.ofMinutes(20);

    private final AppStoreProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public AppStoreServerApiClient(AppStoreProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    /**
     * 거래 id 하나의 현재 구독 상태. 미설정이거나 호출 실패면 {@code null}.
     *
     * <p>거래 id 는 최초 거래든 갱신 거래든 상관없다 — 애플이 같은 구독 그룹의 최신 상태를 준다.
     */
    public AppStoreSubscriptionState fetch(String transactionId) {
        if (!properties.isConfigured() || transactionId == null || transactionId.isBlank()) {
            return null;
        }
        for (String host : hosts()) {
            JsonNode body = call(host, transactionId);
            if (body == null) {
                continue;
            }
            AppStoreSubscriptionState state = toState(body);
            if (state != null) {
                return state;
            }
        }
        return null;
    }

    /**
     * 조회할 호스트 순서. {@code auto} 는 프로덕션 → 샌드박스다 — 애플이 권하는 판별법이고,
     * 샌드박스 계정으로 테스트하는 동안에도 설정을 바꿀 필요가 없다.
     */
    private List<String> hosts() {
        return switch (properties.getEnvironment() == null ? "auto" : properties.getEnvironment()) {
            case "production" -> List.of(PRODUCTION_HOST);
            case "sandbox" -> List.of(SANDBOX_HOST);
            default -> List.of(PRODUCTION_HOST, SANDBOX_HOST);
        };
    }

    private JsonNode call(String host, String transactionId) {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(host + "/inApps/v1/subscriptions/" + transactionId))
                    .header("Authorization", "Bearer " + token())
                    .timeout(Duration.ofSeconds(15))
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                return objectMapper.readTree(response.body());
            }
            if (response.statusCode() == 404 && errorCodeOf(response.body()) == TRANSACTION_NOT_FOUND) {
                // 다른 환경의 거래다 — 호출부가 다음 호스트로 넘어간다. 로그를 남길 일이 아니다.
                return null;
            }
            log.warn("App Store Server API 응답 {} ({}): {}", response.statusCode(), host,
                    abbreviate(response.body()));
            return null;
        } catch (Exception e) {
            // 인터럽트는 삼키지 않는다 — 스레드 상태를 되돌려 두고 넘어간다.
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            log.warn("App Store Server API 호출 실패({}): {}", host, e.getMessage());
            return null;
        }
    }

    private long errorCodeOf(String body) {
        try {
            return objectMapper.readTree(body).path("errorCode").asLong(-1);
        } catch (Exception e) {
            return -1;
        }
    }

    /**
     * 응답 → 우리 상태.
     *
     * <p>{@code data[].lastTransactions[]} 안의 {@code signedTransactionInfo}·
     * {@code signedRenewalInfo} 는 JWS 다. <b>서명을 검증하지 않고 payload 만 읽는다</b> —
     * 이 응답은 우리가 TLS 로 애플에게 직접 물어서 받은 것이라 출처가 이미 확인돼 있다.
     * (검증이 필요한 것은 알림처럼 <b>먼저 찾아오는</b> JWS 인데, 그쪽은 아예 신뢰하지 않는다.)
     */
    private AppStoreSubscriptionState toState(JsonNode body) {
        JsonNode last = body.path("data").path(0).path("lastTransactions").path(0);
        if (last.isMissingNode()) {
            return null;
        }
        JsonNode transaction = AppStoreJws.payload(objectMapper, last.path("signedTransactionInfo").asText(null));
        if (transaction == null) {
            return null;
        }
        JsonNode renewal = AppStoreJws.payload(objectMapper, last.path("signedRenewalInfo").asText(null));

        boolean revoked = transaction.hasNonNull("revocationDate");
        return new AppStoreSubscriptionState(
                revoked ? SubscriptionStatus.REFUNDED : statusOf(last.path("status").asInt(-1)),
                transaction.path("productId").asText(null),
                transaction.path("originalTransactionId").asText(null),
                millisToLocal(transaction.path("expiresDate").asLong(0)),
                renewal != null && renewal.path("autoRenewStatus").asInt(0) == 1,
                AppAccountTokens.userIdOf(transaction.path("appAccountToken").asText(null)));
    }

    /**
     * 애플 구독 상태 코드 → 우리 상태.
     *
     * <p>1 활성 · 2 만료 · 3 결제 재시도 · 4 유예 기간 · 5 해지(환불·취소).
     * <b>유예 기간(4)은 활성으로 본다</b> — 결제가 실패했어도 애플이 아직 이용 권한을 주는
     * 구간이라, 여기서 끊으면 돈을 낸 사람의 기능을 먼저 뺏는 꼴이 된다.
     * 재시도(3)는 권한이 이미 끝난 상태다.
     */
    private SubscriptionStatus statusOf(int appleStatus) {
        return switch (appleStatus) {
            case 1, 4 -> SubscriptionStatus.ACTIVE;
            case 5 -> SubscriptionStatus.REFUNDED;
            default -> SubscriptionStatus.EXPIRED;
        };
    }

    private LocalDateTime millisToLocal(long millis) {
        // 서버가 UTC 로 돌고 우리 LocalDateTime 은 그 벽시계다(JacksonConfig 주석 참고).
        return millis <= 0 ? null : LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), ZoneOffset.UTC);
    }

    /** App Store Server API 인증 토큰(ES256). 호출마다 새로 만든다 — 서명 한 번은 충분히 싸다. */
    private String token() throws Exception {
        Instant now = Instant.now();
        return Jwts.builder()
                .header().keyId(properties.getKeyId()).add("typ", "JWT").and()
                .issuer(properties.getIssuerId())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(TOKEN_TTL)))
                .audience().add("appstoreconnect-v1").and()
                .claim("bid", properties.getBundleId())
                .signWith(privateKey(), Jwts.SIG.ES256)
                .compact();
    }

    /** .p8(PKCS#8 PEM)을 base64 로 감싼 값에서 EC 개인키를 꺼낸다. */
    private PrivateKey privateKey() throws Exception {
        String pem = new String(Base64.getDecoder().decode(properties.getPrivateKeyBase64()),
                StandardCharsets.UTF_8);
        String der = pem.replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        return KeyFactory.getInstance("EC")
                .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(der)));
    }

    private String abbreviate(String body) {
        if (body == null) {
            return "";
        }
        return body.length() <= 200 ? body : body.substring(0, 200) + "…";
    }
}
