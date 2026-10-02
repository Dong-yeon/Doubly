package com.fitto.place.service;

import com.fitto.place.service.PlaceLinkHosts.PlaceRef;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.Inet4Address;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.UnknownHostException;
import java.util.Optional;

/**
 * 사용자가 붙여넣은 지도 링크를 서버가 대신 열어 정본 장소 페이지까지 간다 — SSRF 를 막으면서.
 *
 * <p><b>막는 것</b>
 * <ul>
 *   <li>https 아닌 링크, 기본 포트(443) 아닌 링크, user@host 형태 — {@link PlaceLinkHosts#isAllowed}</li>
 *   <li>허용 목록 밖 호스트 — <b>리다이렉트의 매 hop 마다</b> 다시 검사한다. 첫 링크가 kko.to 여도
 *       Location 이 다른 곳을 가리키면 거기서 멈춘다.</li>
 *   <li>DNS 결과가 사설·루프백·링크로컬·CGNAT·멀티캐스트·미지정 주소인 호스트 — 허용 목록 호스트라도
 *       DNS 가 내부망을 가리키면 열지 않는다.</li>
 *   <li>리다이렉트 5회 초과</li>
 * </ul>
 *
 * <p><b>남는 틈</b>: DNS 를 검사한 뒤 HttpClient 가 연결할 때 다시 조회한다(검사-사용 사이 리바인딩).
 * 허용 목록이 카카오·네이버 소유 도메인뿐이라 공격자가 그 DNS 를 바꿀 수 없다는 점에 기댄다 — 목록에
 * 남의 도메인(단축 URL 서비스 등)을 넣는다면 연결 IP 를 고정하는 방식으로 바꿔야 한다.
 *
 * <p><b>짧은 링크 → 정본</b>: hop 의 URL 에서 장소 id 가 나오면(map.kakao.com/?itemId=…,
 * map.naver.com/p/entry/place/…) 그 페이지 대신 og 태그가 있는 정본 페이지로 바꿔 연다 — 지도 화면
 * 페이지의 og:title 은 "카카오맵"·"네이버지도" 뿐이다(2026-10-02 실측).
 */
@Component
public class PlaceLinkFetcher {

    private static final Logger log = LoggerFactory.getLogger(PlaceLinkFetcher.class);

    /** 따라가는 리다이렉트 최대 횟수 — 요청은 최대 이 값 + 1 번 */
    static final int MAX_REDIRECTS = 5;

    /** DNS 조회 경계 — 테스트가 사설 IP 를 돌려주는 가짜로 바꾼다 */
    public interface HostResolver {
        InetAddress[] resolve(String host) throws UnknownHostException;
    }

    public enum Failure {
        /** https 아님·포트·허용 목록 밖(첫 링크 또는 리다이렉트 hop) */
        NOT_ALLOWED,
        /** DNS 가 내부망을 가리킨다 */
        PRIVATE_ADDRESS,
        TOO_MANY_REDIRECTS,
        /** 연결·응답 시간 초과, 연결 실패, DNS 실패 */
        UNREACHABLE,
        /** 2xx·3xx 가 아닌 응답(카카오 403, 네이버 429 등) */
        BAD_STATUS
    }

    public static final class FetchException extends Exception {
        private final Failure failure;

        FetchException(Failure failure, String detail) {
            super(failure + ": " + detail);
            this.failure = failure;
        }

        public Failure failure() {
            return failure;
        }
    }

    /** 받아 온 정본 페이지 — finalUrl 은 마지막으로 연 주소, ref 는 그 길에 꺼낸 장소 id(없으면 null) */
    public record Page(URI finalUrl, PlaceRef ref, String body) {
    }

    private final PlaceLinkTransport transport;
    private final HostResolver resolver;

    @Autowired
    public PlaceLinkFetcher(PlaceLinkTransport transport) {
        this(transport, InetAddress::getAllByName);
    }

    PlaceLinkFetcher(PlaceLinkTransport transport, HostResolver resolver) {
        this.transport = transport;
        this.resolver = resolver;
    }

    public Page fetch(String rawUrl) throws FetchException {
        URI current = parse(rawUrl);
        PlaceRef ref = null;
        int redirects = 0;
        while (true) {
            if (!PlaceLinkHosts.isAllowed(current)) {
                throw new FetchException(Failure.NOT_ALLOWED, String.valueOf(PlaceLinkHosts.hostOf(current)));
            }
            Optional<PlaceRef> found = PlaceLinkHosts.extract(current);
            if (found.isPresent()) {
                ref = found.get();
                if (!ref.isOnCanonicalHost(current)) {
                    // 지도 화면 링크 — og 가 있는 정본으로 갈아탄다(리다이렉트로 세지 않는다: 우리가 고른 주소다)
                    current = ref.canonicalPage();
                    continue;
                }
            }
            requirePublicAddress(PlaceLinkHosts.hostOf(current));

            PlaceLinkTransport.Response response;
            try {
                response = transport.get(current);
            } catch (IOException e) {
                throw new FetchException(Failure.UNREACHABLE, e.getClass().getSimpleName() + " " + e.getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new FetchException(Failure.UNREACHABLE, "interrupted");
            }

            int status = response.status();
            if (status >= 300 && status < 400 && response.location() != null) {
                if (redirects >= MAX_REDIRECTS) {
                    throw new FetchException(Failure.TOO_MANY_REDIRECTS, current.toString());
                }
                redirects++;
                current = resolveLocation(current, response.location());
                continue;
            }
            if (status < 200 || status >= 300) {
                throw new FetchException(Failure.BAD_STATUS, status + " " + PlaceLinkHosts.hostOf(current));
            }
            return new Page(current, ref, response.body() == null ? "" : response.body());
        }
    }

    private static URI parse(String raw) throws FetchException {
        try {
            URI uri = new URI(raw == null ? "" : raw.trim());
            if (uri.getHost() == null) {
                throw new FetchException(Failure.NOT_ALLOWED, "host 없음");
            }
            return uri;
        } catch (URISyntaxException e) {
            throw new FetchException(Failure.NOT_ALLOWED, "URL 형식");
        }
    }

    private static URI resolveLocation(URI base, String location) throws FetchException {
        try {
            // 상대 경로 Location 도 있다 — 기준 URL 로 풀어 절대 주소로 만든 뒤 허용 목록에 다시 넣는다
            return base.resolve(new URI(location.trim()));
        } catch (URISyntaxException | IllegalArgumentException e) {
            throw new FetchException(Failure.NOT_ALLOWED, "Location 형식");
        }
    }

    private void requirePublicAddress(String host) throws FetchException {
        InetAddress[] addresses;
        try {
            addresses = resolver.resolve(host);
        } catch (UnknownHostException e) {
            throw new FetchException(Failure.UNREACHABLE, "DNS " + host);
        }
        if (addresses == null || addresses.length == 0) {
            throw new FetchException(Failure.UNREACHABLE, "DNS 결과 없음 " + host);
        }
        for (InetAddress address : addresses) {
            if (isInternal(address)) {
                log.warn("링크 해석 차단 — {} 이(가) 내부 주소 {} 를 가리킨다", host, address.getHostAddress());
                throw new FetchException(Failure.PRIVATE_ADDRESS, host);
            }
        }
    }

    /** 사설·루프백·링크로컬·미지정·멀티캐스트, IPv4 CGNAT(100.64/10)·0/8, IPv6 ULA(fc00::/7) */
    static boolean isInternal(InetAddress address) {
        if (address.isAnyLocalAddress() || address.isLoopbackAddress() || address.isLinkLocalAddress()
                || address.isSiteLocalAddress() || address.isMulticastAddress()) {
            return true;
        }
        byte[] b = address.getAddress();
        if (address instanceof Inet4Address) {
            int first = b[0] & 0xff;
            int second = b[1] & 0xff;
            return first == 0 || (first == 100 && second >= 64 && second <= 127);
        }
        if (address instanceof Inet6Address) {
            // IPv4-mapped(::ffff:a.b.c.d) 는 안쪽 IPv4 로 다시 본다
            boolean mapped = true;
            for (int i = 0; i < 10; i++) {
                if (b[i] != 0) {
                    mapped = false;
                    break;
                }
            }
            if (mapped && (b[10] & 0xff) == 0xff && (b[11] & 0xff) == 0xff) {
                try {
                    return isInternal(InetAddress.getByAddress(new byte[]{b[12], b[13], b[14], b[15]}));
                } catch (UnknownHostException e) {
                    return true;
                }
            }
            return (b[0] & 0xfe) == 0xfc;
        }
        return true;
    }
}
