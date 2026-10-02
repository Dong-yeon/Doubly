package com.fitto.place.service;

import com.fitto.place.service.PlaceLinkFetcher.Failure;
import com.fitto.place.service.PlaceLinkFetcher.FetchException;
import com.fitto.place.service.PlaceLinkFetcher.Page;
import com.fitto.place.service.PlaceLinkHosts.Provider;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;
import java.net.http.HttpTimeoutException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 링크 따라가기 + SSRF 방어 — 외부 HTTP 없이 가짜 transport·DNS 로 돈다.
 */
class PlaceLinkFetcherTest {

    private static final InetAddress PUBLIC = addr("211.249.220.24");

    /** URL → 응답 표. 없는 URL 을 열면 테스트가 실패한다(예상 밖의 hop) */
    static final class FakeTransport implements PlaceLinkTransport {
        final Map<String, Response> routes = new HashMap<>();
        final List<String> opened = new ArrayList<>();
        IOException failWith;

        FakeTransport route(String url, Response response) {
            routes.put(url, response);
            return this;
        }

        @Override
        public Response get(URI uri) throws IOException {
            opened.add(uri.toString());
            if (failWith != null) {
                throw failWith;
            }
            Response r = routes.get(uri.toString());
            if (r == null) {
                throw new AssertionError("예상 밖의 요청: " + uri);
            }
            return r;
        }
    }

    private static PlaceLinkTransport.Response redirect(String to) {
        return new PlaceLinkTransport.Response(302, to, "");
    }

    private static PlaceLinkTransport.Response ok(String body) {
        return new PlaceLinkTransport.Response(200, null, body);
    }

    private static InetAddress addr(String ip) {
        try {
            return InetAddress.getByName(ip);
        } catch (UnknownHostException e) {
            throw new IllegalStateException(e);
        }
    }

    private static PlaceLinkFetcher fetcher(FakeTransport t) {
        return new PlaceLinkFetcher(t, host -> new InetAddress[]{PUBLIC});
    }

    @Test
    void 짧은_링크의_리다이렉트를_따라가다_장소_id가_나오면_정본_페이지를_연다() throws Exception {
        FakeTransport t = new FakeTransport()
                .route("https://kko.to/abcDEF", redirect("https://map.kakao.com/?urlX=1&itemId=634902312"))
                .route("https://place.map.kakao.com/634902312", ok("<meta property=\"og:title\" content=\"누데이크 성수\">"));

        Page page = fetcher(t).fetch("https://kko.to/abcDEF");

        assertThat(page.ref().provider()).isEqualTo(Provider.KAKAO);
        assertThat(page.ref().placeId()).isEqualTo("634902312");
        assertThat(page.finalUrl().toString()).isEqualTo("https://place.map.kakao.com/634902312");
        // 지도 화면(map.kakao.com)은 og 가 "카카오맵" 뿐이라 열지 않고 정본으로 바로 간다
        assertThat(t.opened).containsExactly("https://kko.to/abcDEF", "https://place.map.kakao.com/634902312");
    }

    @Test
    void 네이버_지도_링크는_플레이스_정본으로_바꾸고_업종별_리다이렉트를_따라간다() throws Exception {
        FakeTransport t = new FakeTransport()
                .route("https://naver.me/xYz", redirect("https://map.naver.com/p/entry/place/1857962284?c=15.00"))
                .route("https://m.place.naver.com/place/1857962284/home",
                        redirect("https://m.place.naver.com/restaurant/1857962284/home"))
                .route("https://m.place.naver.com/restaurant/1857962284/home", ok("<html>네이버</html>"));

        Page page = fetcher(t).fetch("https://naver.me/xYz");

        assertThat(page.ref().provider()).isEqualTo(Provider.NAVER);
        assertThat(page.finalUrl().toString()).isEqualTo("https://m.place.naver.com/restaurant/1857962284/home");
    }

    @Test
    void 상대경로_Location도_기준_URL로_풀어_따라간다() throws Exception {
        FakeTransport t = new FakeTransport()
                .route("https://m.place.naver.com/place/42/home", redirect("/restaurant/42/home"))
                .route("https://m.place.naver.com/restaurant/42/home", ok("ok"));

        assertThat(fetcher(t).fetch("https://m.place.naver.com/place/42/home").body()).isEqualTo("ok");
    }

    @Test
    void 허용_목록_밖으로_리다이렉트되면_그_hop에서_멈춘다() {
        FakeTransport t = new FakeTransport()
                .route("https://kko.to/evil", redirect("https://evil.example.com/steal"));

        assertThatThrownBy(() -> fetcher(t).fetch("https://kko.to/evil"))
                .isInstanceOf(FetchException.class)
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.NOT_ALLOWED);
        // 허용 목록 밖 주소는 열지 않았다
        assertThat(t.opened).containsExactly("https://kko.to/evil");
    }

    @Test
    void http로_내려가는_리다이렉트도_막는다() {
        FakeTransport t = new FakeTransport()
                .route("https://naver.me/a", redirect("http://map.naver.com/p/entry/place/1"));

        assertThatThrownBy(() -> fetcher(t).fetch("https://naver.me/a"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.NOT_ALLOWED);
    }

    @Test
    void 첫_링크부터_허용_목록_밖이거나_https가_아니거나_포트가_다르면_열지_않는다() {
        FakeTransport t = new FakeTransport();
        PlaceLinkFetcher f = fetcher(t);

        for (String url : List.of("https://evil.example.com/x", "http://place.map.kakao.com/1",
                "https://place.map.kakao.com:8443/1", "https://user@place.map.kakao.com/1",
                "https://place.map.kakao.com.evil.com/1", "not a url", "file:///etc/passwd")) {
            assertThatThrownBy(() -> f.fetch(url)).as(url)
                    .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.NOT_ALLOWED);
        }
        assertThat(t.opened).isEmpty();
    }

    @Test
    void DNS가_사설_루프백_링크로컬_주소를_가리키면_차단한다() {
        for (String ip : List.of("10.0.0.5", "172.16.3.4", "192.168.0.10", "127.0.0.1", "169.254.169.254",
                "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1")) {
            FakeTransport t = new FakeTransport();
            PlaceLinkFetcher f = new PlaceLinkFetcher(t, host -> new InetAddress[]{addr(ip)});

            assertThatThrownBy(() -> f.fetch("https://place.map.kakao.com/1")).as(ip)
                    .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.PRIVATE_ADDRESS);
            assertThat(t.opened).as(ip).isEmpty();
        }
    }

    @Test
    void 여러_주소_중_하나라도_내부망이면_차단한다() {
        FakeTransport t = new FakeTransport();
        PlaceLinkFetcher f = new PlaceLinkFetcher(t, host -> new InetAddress[]{PUBLIC, addr("10.1.2.3")});

        assertThatThrownBy(() -> f.fetch("https://place.map.kakao.com/1"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.PRIVATE_ADDRESS);
    }

    @Test
    void 리다이렉트_hop의_호스트도_DNS를_다시_검사한다() {
        FakeTransport t = new FakeTransport()
                .route("https://naver.me/a", redirect("https://map.naver.com/somewhere"));
        // naver.me 는 공인 IP, map.naver.com 은 내부망을 가리키는 상황
        PlaceLinkFetcher f = new PlaceLinkFetcher(t,
                host -> new InetAddress[]{host.equals("naver.me") ? PUBLIC : addr("10.0.0.1")});

        assertThatThrownBy(() -> f.fetch("https://naver.me/a"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.PRIVATE_ADDRESS);
        assertThat(t.opened).containsExactly("https://naver.me/a");
    }

    @Test
    void 리다이렉트는_5번까지만_따라간다() throws Exception {
        FakeTransport five = new FakeTransport();
        for (int i = 0; i < 5; i++) {
            five.route("https://naver.me/r" + i, redirect("https://naver.me/r" + (i + 1)));
        }
        five.route("https://naver.me/r5", ok("도착"));
        assertThat(fetcher(five).fetch("https://naver.me/r0").body()).isEqualTo("도착");

        FakeTransport six = new FakeTransport();
        for (int i = 0; i < 6; i++) {
            six.route("https://naver.me/r" + i, redirect("https://naver.me/r" + (i + 1)));
        }
        assertThatThrownBy(() -> fetcher(six).fetch("https://naver.me/r0"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.TOO_MANY_REDIRECTS);
        assertThat(six.opened).hasSize(6);
    }

    @Test
    void 시간_초과는_UNREACHABLE로_바꾼다() {
        FakeTransport t = new FakeTransport();
        t.failWith = new HttpTimeoutException("응답이 5000ms 안에 끝나지 않았다");

        assertThatThrownBy(() -> fetcher(t).fetch("https://place.map.kakao.com/1"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.UNREACHABLE);
    }

    @Test
    void 비정상_상태코드는_BAD_STATUS() {
        FakeTransport t = new FakeTransport()
                .route("https://m.place.naver.com/place/1/home", new PlaceLinkTransport.Response(429, null, ""));

        assertThatThrownBy(() -> fetcher(t).fetch("https://m.place.naver.com/place/1/home"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.BAD_STATUS);
    }

    @Test
    void DNS_실패는_UNREACHABLE() {
        PlaceLinkFetcher f = new PlaceLinkFetcher(new FakeTransport(), host -> {
            throw new UnknownHostException(host);
        });

        assertThatThrownBy(() -> f.fetch("https://kko.to/a"))
                .extracting(e -> ((FetchException) e).failure()).isEqualTo(Failure.UNREACHABLE);
    }
}
