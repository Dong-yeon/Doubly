package com.fitto.place.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 실제 JDK HttpClient 경로 — 시간 초과·본문 상한·리다이렉트 안 따라가기. 외부 대신 루프백의 작은 서버를 쓴다
 * (transport 는 SSRF 검사를 하지 않는다 — 그건 PlaceLinkFetcher 몫이라 여기서 루프백을 열 수 있다).
 */
class JdkPlaceLinkTransportTest {

    private HttpServer server;
    private String base;

    @BeforeEach
    void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/slow", ex -> {
            try {
                Thread.sleep(2_000);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            ex.sendResponseHeaders(200, 0);
            ex.close();
        });
        server.createContext("/slow-body", ex -> {
            // 헤더는 곧바로, 본문은 천천히 — HttpRequest.timeout 이 못 잡는 구간
            ex.sendResponseHeaders(200, 0);
            try (OutputStream out = ex.getResponseBody()) {
                for (int i = 0; i < 20; i++) {
                    out.write("x".repeat(100).getBytes(StandardCharsets.UTF_8));
                    out.flush();
                    Thread.sleep(200);
                }
            } catch (Exception ignored) {
                // 클라이언트가 끊으면 쓰기가 실패한다 — 정상
            }
        });
        server.createContext("/big", ex -> {
            byte[] chunk = "가".repeat(1000).getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, 0);
            try (OutputStream out = ex.getResponseBody()) {
                for (int i = 0; i < 100; i++) {
                    out.write(chunk);
                }
            } catch (Exception ignored) {
                // 상한에서 끊기면 쓰기가 실패한다 — 정상
            }
        });
        server.createContext("/redirect", ex -> {
            ex.getResponseHeaders().add("Location", "https://evil.example.com/");
            ex.sendResponseHeaders(302, -1);
            ex.close();
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private JdkPlaceLinkTransport transport() {
        return new JdkPlaceLinkTransport(Duration.ofMillis(300), Duration.ofMillis(500), 4 * 1024);
    }

    @Test
    void 응답_헤더가_늦으면_시간_초과() {
        long started = System.nanoTime();
        assertThatThrownBy(() -> transport().get(URI.create(base + "/slow")))
                .isInstanceOf(HttpTimeoutException.class);
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(1_800));
    }

    @Test
    void 본문이_늦게_와도_정해진_시간에_끊는다() {
        long started = System.nanoTime();
        assertThatThrownBy(() -> transport().get(URI.create(base + "/slow-body")))
                .isInstanceOf(HttpTimeoutException.class);
        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofMillis(3_000));
    }

    @Test
    void 본문은_상한까지만_읽는다() throws Exception {
        PlaceLinkTransport.Response r = transport().get(URI.create(base + "/big"));

        assertThat(r.status()).isEqualTo(200);
        // 상한 4KB 에서 끊었다 — "가" 는 3바이트라 1365자 + 끊긴 조각 하나(대체 문자)까지만 온다(보낸 건 10만 자)
        assertThat(r.body().length()).isLessThanOrEqualTo(4 * 1024 / 3 + 1);
        assertThat(r.body()).startsWith("가가가");
    }

    @Test
    void 리다이렉트를_스스로_따라가지_않고_Location을_돌려준다() throws Exception {
        PlaceLinkTransport.Response r = transport().get(URI.create(base + "/redirect"));

        assertThat(r.status()).isEqualTo(302);
        assertThat(r.location()).isEqualTo("https://evil.example.com/");
    }

    @Test
    void 운영_기본값은_연결_3초_응답_5초_본문_512KB() {
        assertThat(JdkPlaceLinkTransport.CONNECT_TIMEOUT).isEqualTo(Duration.ofSeconds(3));
        assertThat(JdkPlaceLinkTransport.READ_TIMEOUT).isEqualTo(Duration.ofSeconds(5));
        assertThat(JdkPlaceLinkTransport.MAX_BODY_BYTES).isEqualTo(512 * 1024);
    }
}
