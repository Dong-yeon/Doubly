package com.fitto.common.plan;

import java.util.Map;

/**
 * Pub/Sub 푸시 구독이 웹훅 URL로 보내는 바깥 봉투.
 *
 * <p>실제 RTDN 내용은 {@code message.data}에 base64로 담겨 있다 — Google Play가 아니라
 * Pub/Sub 자체의 표준 푸시 메시지 형식이다. {@link GooglePlayWebhookController} 가 이를
 * 디코드해 {@link GooglePlayDeveloperNotification} 으로 파싱한다.
 */
public record GooglePlayPubSubEnvelope(Message message, String subscription) {

    public record Message(String data, String messageId, String publishTime, Map<String, String> attributes) {
    }
}
