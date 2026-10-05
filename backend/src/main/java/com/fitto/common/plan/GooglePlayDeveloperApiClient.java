package com.fitto.common.plan;

import com.google.api.client.googleapis.javanet.GoogleNetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import com.google.api.services.androidpublisher.AndroidPublisher;
import com.google.api.services.androidpublisher.AndroidPublisherScopes;
import com.google.api.services.androidpublisher.model.ProductPurchase;
import com.google.api.services.androidpublisher.model.ProductPurchasesAcknowledgeRequest;
import com.google.api.services.androidpublisher.model.SubscriptionPurchasesAcknowledgeRequest;
import com.google.api.services.androidpublisher.model.VoidedPurchase;
import com.google.api.services.androidpublisher.model.VoidedPurchasesListResponse;
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
            // acknowledgementState: 0 미승인 · 1 승인
            boolean acknowledged = purchase.getAcknowledgementState() != null && purchase.getAcknowledgementState() == 1;
            return new StoreProductPurchase(productId, parseUserId(purchase.getObfuscatedExternalAccountId()), valid,
                    acknowledged);
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
        boolean acknowledged = "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED".equals(purchase.getAcknowledgementState());
        return new GooglePlaySubscriptionState(status, productId, expiresAt, autoRenew, userId, acknowledged);
    }

    /**
     * 구독 결제를 승인한다 — 앱이 {@code finishTransaction} 전에 꺼져도 3일 자동 환불을 막는다.
     *
     * <p>승인은 원래 앱 몫인데, 앱은 서버 검증이 끝난 뒤에만 승인한다(iap.ts). 그 사이 앱이 죽거나 사용자가
     * 사흘 동안 앱을 안 열면 <b>PRO 는 이미 준 채로 돈만 돌려준다</b>. 검증을 통과한 결제는 서버가 바로
     * 승인해 둔다. 이미 승인된 결제를 다시 승인해도 문제는 없지만, 호출부가 미승인일 때만 부른다.
     *
     * @return 승인했으면 true. 키가 없거나 실패하면 false(앱의 승인·다음 동기화가 남아 있다)
     */
    public boolean acknowledgeSubscription(String subscriptionId, String purchaseToken) {
        AndroidPublisher publisher = clientOrNull();
        if (publisher == null || subscriptionId == null || purchaseToken == null) {
            return false;
        }
        try {
            publisher.purchases().subscriptions()
                    .acknowledge(properties.getPackageName(), subscriptionId, purchaseToken,
                            new SubscriptionPurchasesAcknowledgeRequest())
                    .execute();
            return true;
        } catch (IOException e) {
            log.warn("Play 구독 승인 실패({}): {}", subscriptionId, e.getMessage());
            return false;
        }
    }

    /** 일회성 상품(크레딧) 결제를 승인한다 — {@link #acknowledgeSubscription} 과 같은 이유. 소모(consume)는 앱이 한다. */
    public boolean acknowledgeProduct(String productId, String purchaseToken) {
        AndroidPublisher publisher = clientOrNull();
        if (publisher == null || productId == null || purchaseToken == null) {
            return false;
        }
        try {
            publisher.purchases().products()
                    .acknowledge(properties.getPackageName(), productId, purchaseToken,
                            new ProductPurchasesAcknowledgeRequest())
                    .execute();
            return true;
        } catch (IOException e) {
            log.warn("Play 일회성 상품 승인 실패({}): {}", productId, e.getMessage());
            return false;
        }
    }

    /** 무효 결제를 찾을 때 거슬러 보는 기간 — Play 가 보관하는 최대치(30일)와 같다. */
    private static final long VOIDED_LOOKBACK_MS = 30L * 24 * 60 * 60 * 1000;

    /**
     * 이 결제가 무효(환불·지불 거절·취소)됐는가 — Voided Purchases API 로 확인한다.
     *
     * <p>RTDN 의 {@code voidedPurchaseNotification} 을 그대로 믿지 않고 여기서 다시 묻는다. 웹훅 인증이 공유 토큰뿐이라,
     * 알림만 보고 크레딧을 회수하면 토큰이 새는 순간 남의 크레딧을 지울 수 있다.
     *
     * @return 무효면 true, 아니면 false, 조회 실패면 null
     */
    public Boolean isVoided(String purchaseToken) {
        AndroidPublisher publisher = clientOrNull();
        if (publisher == null || purchaseToken == null) {
            return null;
        }
        try {
            String pageToken = null;
            do {
                VoidedPurchasesListResponse page = publisher.purchases().voidedpurchases()
                        .list(properties.getPackageName())
                        .setStartTime(System.currentTimeMillis() - VOIDED_LOOKBACK_MS)
                        .setToken(pageToken)
                        .execute();
                if (page.getVoidedPurchases() != null) {
                    for (VoidedPurchase voided : page.getVoidedPurchases()) {
                        if (purchaseToken.equals(voided.getPurchaseToken())) {
                            return true;
                        }
                    }
                }
                pageToken = page.getTokenPagination() == null ? null : page.getTokenPagination().getNextPageToken();
            } while (pageToken != null);
            return false;
        } catch (IOException e) {
            log.warn("Play 무효 결제 조회 실패: {}", e.getMessage());
            return null;
        }
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
