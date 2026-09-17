package com.fitto.common.plan;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Base64;

/**
 * 애플이 보내는 JWS 에서 payload 만 꺼낸다.
 *
 * <p><b>서명은 검증하지 않는다.</b> 이 저장소가 JWS 를 읽는 자리는 둘인데 어느 쪽도
 * 검증이 필요 없기 때문이다:
 * <ul>
 *   <li>{@link AppStoreServerApiClient} — 우리가 TLS 로 애플에게 직접 물어서 받은 응답이라
 *       출처가 이미 확인돼 있다.</li>
 *   <li>{@link AppStoreNotificationController} — 먼저 찾아온 것이라 신뢰할 수 없다. 그래서
 *       <b>내용을 쓰지 않고</b> 거래 id 하나만 꺼내 Server API 로 되묻는다. 가짜 알림이 와도
 *       애플이 "그런 거래 없음"이라고 답하므로 DB 가 바뀌지 않는다.</li>
 * </ul>
 * 즉 검증을 생략한 게 아니라, <b>검증이 필요한 경로를 만들지 않은</b> 것이다.
 * 나중에 알림 내용을 그대로 쓰게 바꾼다면 그때는 인증서 체인 검증이 반드시 함께 와야 한다.
 */
final class AppStoreJws {

    private AppStoreJws() {
    }

    /** 가운데 조각(payload)을 base64url 디코딩해 JSON 으로. 못 읽으면 null. */
    static JsonNode payload(ObjectMapper objectMapper, String jws) {
        if (jws == null || jws.isBlank()) {
            return null;
        }
        try {
            String[] parts = jws.split("\\.");
            if (parts.length < 2) {
                return null;
            }
            return objectMapper.readTree(Base64.getUrlDecoder().decode(parts[1]));
        } catch (Exception e) {
            return null;
        }
    }
}
