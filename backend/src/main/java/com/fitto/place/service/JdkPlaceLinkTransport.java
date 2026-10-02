package com.fitto.place.service;

import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * JDK HttpClient 로 링크 한 hop 을 연다.
 *
 * <ul>
 *   <li><b>리다이렉트를 따라가지 않는다</b>(Redirect.NEVER) — 다음 hop 은 {@link PlaceLinkFetcher} 가 검사한 뒤에 연다.</li>
 *   <li><b>시간</b>: 연결 3초, 응답(헤더+본문) 5초. 본문을 다 받는 데까지 5초 안이어야 한다 —
 *       {@code HttpRequest.timeout} 은 헤더까지만 재므로 본문은 {@code get(…, 5s)} 로 한 번 더 묶는다.</li>
 *   <li><b>크기</b>: 본문은 512KB 까지만 읽고 구독을 끊는다. og 태그는 head 앞쪽에 있다
 *       (네이버 플레이스 실측: 페이지 677KB 중 og:title 이 1.4KB 지점).</li>
 * </ul>
 *
 * <p>User-Agent 를 미리보기 봇으로 둔다 — 카카오 장소 페이지는 브라우저 UA 에 403, 미리보기 UA 에는
 * og:title(가게 이름)·og:description(주소)을 준다(2026-10-02 실측).
 */
@Component
public class JdkPlaceLinkTransport implements PlaceLinkTransport {

    static final int MAX_BODY_BYTES = 512 * 1024;
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration READ_TIMEOUT = Duration.ofSeconds(5);
    private static final String USER_AGENT = "Mozilla/5.0 (compatible; DublyLinkPreview/1.0; +https://dubly.co.kr)";

    private final HttpClient client;
    private final Duration readTimeout;
    private final int maxBodyBytes;

    public JdkPlaceLinkTransport() {
        this(CONNECT_TIMEOUT, READ_TIMEOUT, MAX_BODY_BYTES);
    }

    /** 테스트용 — 짧은 시간·작은 상한으로 같은 경로를 확인한다 */
    JdkPlaceLinkTransport(Duration connectTimeout, Duration readTimeout, int maxBodyBytes) {
        this.client = HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        this.readTimeout = readTimeout;
        this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    public Response get(URI uri) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(readTimeout)
                .header("User-Agent", USER_AGENT)
                .header("Accept", "text/html,application/xhtml+xml")
                .header("Accept-Language", "ko-KR,ko;q=0.9")
                .GET()
                .build();
        CompletableFuture<HttpResponse<byte[]>> future =
                client.sendAsync(request, info -> new LimitedBodySubscriber(maxBodyBytes));
        HttpResponse<byte[]> response;
        try {
            response = future.get(readTimeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            future.cancel(true);
            throw new HttpTimeoutException("응답이 " + readTimeout.toMillis() + "ms 안에 끝나지 않았다");
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof IOException io) {
                throw io;
            }
            throw new IOException(cause);
        }
        String location = response.headers().firstValue("Location").orElse(null);
        return new Response(response.statusCode(), location, new String(response.body(), StandardCharsets.UTF_8));
    }

    /** 상한까지만 모으고 구독을 끊는 본문 구독자 — 끊어도 그때까지 받은 것으로 완료한다 */
    static final class LimitedBodySubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final int limit;
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private Flow.Subscription subscription;

        LimitedBodySubscriber(int limit) {
            this.limit = limit;
        }

        @Override
        public CompletionStage<byte[]> getBody() {
            return result;
        }

        @Override
        public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            subscription.request(1);
        }

        @Override
        public void onNext(List<ByteBuffer> items) {
            for (ByteBuffer item : items) {
                int room = limit - buffer.size();
                if (room <= 0) {
                    break;
                }
                byte[] chunk = new byte[Math.min(room, item.remaining())];
                item.get(chunk);
                buffer.write(chunk, 0, chunk.length);
            }
            if (buffer.size() >= limit) {
                subscription.cancel();
                result.complete(buffer.toByteArray());
            } else {
                subscription.request(1);
            }
        }

        @Override
        public void onError(Throwable throwable) {
            result.completeExceptionally(throwable);
        }

        @Override
        public void onComplete() {
            result.complete(buffer.toByteArray());
        }
    }
}
