package com.fitto.common.plan;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.androidpublisher.AndroidPublisher;
import com.google.api.services.androidpublisher.AndroidPublisherScopes;
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
        String obfuscatedId = purchase.getExternalAccountIdentifiers().getObfuscatedExternalAccountId();
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
