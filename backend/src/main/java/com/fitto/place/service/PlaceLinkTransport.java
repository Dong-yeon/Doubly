package com.fitto.place.service;

import java.io.IOException;
import java.net.URI;

/**
 * 링크 한 hop 을 여는 경계 — 리다이렉트는 따라가지 않고 응답 그대로 돌려준다(따라갈지는
 * {@link PlaceLinkFetcher} 가 hop 마다 허용 목록·사설 IP 를 다시 보고 정한다).
 * 테스트는 이 인터페이스를 가짜로 바꿔 외부 HTTP 없이 돈다.
 */
public interface PlaceLinkTransport {

    /**
     * @param status   HTTP 상태
     * @param location 3xx 의 Location 헤더(없으면 null)
     * @param body     본문 — 상한({@link JdkPlaceLinkTransport#MAX_BODY_BYTES})에서 잘린다
     */
    record Response(int status, String location, String body) {
    }

    /** 시간 안에 못 받으면 {@link java.net.http.HttpTimeoutException} 등 IOException 을 던진다 */
    Response get(URI uri) throws IOException, InterruptedException;
}
