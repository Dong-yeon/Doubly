package com.fitto.common.plan;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.androidpublisher.AndroidPublisher;
import com.google.api.services.androidpublisher.AndroidPublisherScopes;
import com.google.api.services.androidpublisher.model.ProductPurchase;
import com.google.api.services.androidpublisher.model.SubscriptionPurchaseLineItem;
import com.google.api.services.androidpublisher.model.SubscriptionPurchaseV2;
import com.google.auth.http.HttpCredentialsAdapter;
import com.google.auth.oauth2.GoogleCredentials;
import com.fitto.common.config.GooglePlayProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;

/**
 * Google Play Developer API 로 구독의 진짜 상태를 조회한다.
 *
 * <p>RTDN 웹훅은 "뭔가 바뀌었다"는 신호일 뿐이라, 실제 활성 여부·만료 시각은 항상 이 API를
 * 다시 불러 확인해야 한다(Google 공식 권장 패턴). 서비스 계정 키가 없으면(스토어 등록 전)
 * {@link #fetch}는 {@code null}을 돌려준다 — 호출부가 그 경우를 조용히 건너뛴다.
 */
@Component
public class GooglePlayDeveloperApiClient {

    private static final Logger log = LoggerFactory.getLogger(GooglePlayDeveloperApiClient.class);

    private final GooglePlayProperties properties;
    private volatile AndroidPublisher client;

    public GooglePlayDeveloperApiClient(GooglePlayProperties properties) {
        this.properties = properties;
    }

    /** purchaseToken 하나의 현재 상태를 조회한다. 미설정이거나 호출 실패 시 {@code null}. */
    public GooglePlaySubscriptionState fetch(String purchaseToken) {
        AndroidPublisher publisher = clientOrNull();
        if (publisher == null) {
            return null;
        }
        try {
            SubscriptionPurchaseV2 purchase = publisher.purchases()
                    .subscriptionsv2()
                    .get(properties.getPackageName(), purchaseToken)
                    .execute();
            return toState(purchase);
        } catch (IOException e) {
            log.warn("Play Developer API 호출 실패: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 일회성 상품(스티커 팩) 한 건의 상태 — 구독의 {@link #fetch} 와 같은 자리.
     *
     * <p>구독은 {@code purchaseToken} 하나로 조회되지만 일회성 상품은 <b>상품 id 도 함께</b>
     * 필요하다(Play API 의 엔드포인트가 그렇게 생겼다). 그래서 앱이 두 값을 다 보낸다 —
     * 다만 <b>상품 id 를 믿지는 않는다</b>: 토큰과 짝이 안 맞으면 Play 가 404 로 답하므로,
     * 남의 팩 id 를 적어 보내도 그 팩이 열리지 않는다.
     *
     * <p>키가 없으면(스토어 등록 전) {@code null} — 호출부가 조용히 건너뛴다.
     */
    public StoreProductPurchase fetchProduct(String productId, String purchaseToken) {
        AndroidPublisher publisher = clientOrNull();
        if (publisher == null || productId == null || purchaseToken == null) {
            return null;
        }
        try {
            ProductPurchase purchase = publisher.purchases()
                    .products()
                    .get(properties.getPackageName(), productId, purchaseToken)
                    .execute();
            /*
             * purchaseState: 0 구매완료 · 1 취소 · 2 보류(pending).
             * 보류를 유효로 보면 "결제 승인 대기 중"인 사람에게 팩을 먼저 열어주고, 승인이
             * 끝내 안 나도 회수할 경로가 없다 — 일회성 상품은 만료가 없기 때문이다.
             */
            Integer state = purchase.getPurchaseState();
            boolean valid = state != null && state == 0;
            return new StoreProductPurchase(productId, parseUserId(purchase.getObfuscatedExternalAccountId()), valid);
        } catch (IOException e) {
            log.warn("Play Developer API 일회성 상품 조회 실패({}): {}", productId, e.getMessage());
            return null;
        }
    }

    private GooglePlaySubscriptionState toState(SubscriptionPurchaseV2 purchase) {
        String rawState = purchase.getSubscriptionState();
        SubscriptionStatus status = switch (rawState == null ? "" : rawState) {
            // CANCELED/IN_GRACE_PERIOD 도 기간이 끝날 때까지는 접근을 유지한다 —
            // 해지 예약일 뿐 즉시 회수가 아니다. 만료는 expiresAt이 지나면서 자연히 반영된다.
            case "SUBSCRIPTION_STATE_ACTIVE",
                 "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
                 "SUBSCRIPTION_STATE_CANCELED" -> SubscriptionStatus.ACTIVE;
            case "SUBSCRIPTION_STATE_REVOKED" -> SubscriptionStatus.REFUNDED;
            // ON_HOLD(결제 재시도 중)·PAUSED(일시정지)·EXPIRED·PENDING 등은 접근을 주지 않는다.
            default -> SubscriptionStatus.EXPIRED;
        };
        boolean autoRenew = !"SUBSCRIPTION_STATE_CANCELED".equals(rawState);

        List<SubscriptionPurchaseLineItem> lineItems = purchase.getLineItems();
        SubscriptionPurchaseLineItem item = (lineItems == null || lineItems.isEmpty()) ? null : lineItems.get(0);
        LocalDateTime expiresAt = (item == null || item.getExpiryTime() == null)
                ? null
                : LocalDateTime.ofInstant(Instant.parse(item.getExpiryTime()), ZoneOffset.UTC);
        String productId = item == null ? null : item.getProductId();

        Long userId = parseUserId(purchase);
        return new GooglePlaySubscriptionState(status, productId, expiresAt, autoRenew, userId);
    }

    /**
     * 구매 시 클라이언트가 실은 obfuscatedAccountId(=우리 userId)를 읽어온다.
     * 아직 결제 SDK가 안 붙어서 이 값을 안 실을 수 있는데, 그 경우 여기서 null을 돌려주면
     * {@link GooglePlaySubscriptionSyncService}가 신규 구독 생성을 건너뛴다.
     */
    private Long parseUserId(SubscriptionPurchaseV2 purchase) {
        if (purchase.getExternalAccountIdentifiers() == null) {
            return null;
        }
        return parseUserId(purchase.getExternalAccountIdentifiers().getObfuscatedExternalAccountId());
    }

    /** 일회성 상품은 식별자가 최상위에 평평하게 있다 — 파싱 규칙은 구독과 같다. */
    private Long parseUserId(String obfuscatedId) {
        if (obfuscatedId == null || obfuscatedId.isBlank()) {
            return null;
        }
        try {
            return Long.valueOf(obfuscatedId);
        } catch (NumberFormatException e) {
            log.warn("obfuscatedExternalAccountId 파싱 실패: {}", obfuscatedId);
            return null;
        }
    }

    private AndroidPublisher clientOrNull() {
        if (!properties.isConfigured()) {
            return null;
        }
        AndroidPublisher existing = client;
        if (existing != null) {
            return existing;
        }
        synchronized (this) {
            if (client == null) {
                client = buildClient();
            }
            return client;
        }
    }

    private AndroidPublisher buildClient() {
        try {
            byte[] keyBytes = Base64.getDecoder().decode(properties.getServiceAccountJsonBase64());
            GoogleCredentials credentials = GoogleCredentials
                    .fromStream(new ByteArrayInputStream(keyBytes))
                    .createScoped(AndroidPublisherScopes.ANDROIDPUBLISHER);
            return new AndroidPublisher.Builder(
                    GoogleNetHttpTransport.newTrustedTransport(),
                    GsonFactory.getDefaultInstance(),
                    new HttpCredentialsAdapter(credentials))
                    .setApplicationName("Dubly")
                    .build();
        } catch (Exception e) {
            log.error("Google Play Developer API 클라이언트 초기화 실패 — 웹훅 동기화가 비활성됩니다", e);
            return null;
        }
    }
}
