package com.fitto.place.service;

import java.net.URI;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 채팅 링크 → 럽슐랭 — 어떤 호스트를 따라가도 되는지, 그리고 URL 에서 장소 id 를 어떻게 꺼내는지.
 * HTTP 를 하지 않는 순수 함수만 둔다(테스트가 네트워크 없이 돈다).
 *
 * <p><b>허용 목록이 곧 SSRF 의 첫 방어선이다</b>: 서버가 사용자가 붙여넣은 URL 을 대신 열어 주므로,
 * 리다이렉트의 매 hop 마다 이 목록으로 다시 검사한다({@link PlaceLinkFetcher}). 목록 밖으로 튀면
 * 그 자리에서 멈춘다. 프론트의 칩 노출 목록(utils/placeLinkHosts.ts)과 같은 값이어야 하고,
 * 다음 범위(콘텐츠·인스타)는 두 곳에 한 줄씩 늘리면 된다.
 *
 * <p>docs/LOVELICHELIN_CHAT_LINK_2026-10-02.md
 */
public final class PlaceLinkHosts {

    private PlaceLinkHosts() {
    }

    public enum Provider { KAKAO, NAVER }

    /** 따라가도 되는 호스트 — 정확히 일치해야 한다(하위 도메인 와일드카드 없음) */
    public static final Set<String> ALLOWED_HOSTS = Set.of(
            "place.map.kakao.com",
            "kko.to",
            "map.kakao.com",
            "naver.me",
            "map.naver.com",
            "m.place.naver.com");

    /** 장소 하나를 가리키는 링크에서 꺼낸 것 — 어느 지도의 몇 번 장소인가 */
    public record PlaceRef(Provider provider, String placeId) {
        /** og:title 이 실린 정본 페이지 — 짧은 링크·지도 화면 링크는 이리로 바꿔 연다 */
        public URI canonicalPage() {
            return provider == Provider.KAKAO
                    ? URI.create("https://place.map.kakao.com/" + placeId)
                    // /place/{id}/home 은 업종별 경로(/restaurant/{id}/home 등)로 한 번 더 넘어간다
                    : URI.create("https://m.place.naver.com/place/" + placeId + "/home");
        }

        /** 이미 정본 호스트 위에 있는가 — 그렇다면 다시 바꾸지 않는다(네이버 업종별 리다이렉트와 핑퐁 방지) */
        public boolean isOnCanonicalHost(URI uri) {
            String host = hostOf(uri);
            return provider == Provider.KAKAO ? "place.map.kakao.com".equals(host) : "m.place.naver.com".equals(host);
        }
    }

    // 카카오: place.map.kakao.com/{id}, place.map.kakao.com/m/{id}, map.kakao.com/link/map/{id}
    private static final Pattern KAKAO_PLACE_PATH = Pattern.compile("^/(?:m/)?(\\d{1,20})(?:/.*)?$");
    private static final Pattern KAKAO_LINK_MAP_PATH = Pattern.compile("^/link/map/(\\d{1,20})(?:/.*)?$");
    // 카카오: map.kakao.com/?itemId={id}
    private static final Pattern KAKAO_ITEM_QUERY = Pattern.compile("(?:^|&)itemId=(\\d{1,20})(?:&|$)");
    // 네이버: /p/entry/place/{id}, /v5/entry/place/{id}, m.place.naver.com/{업종}/{id}/..., /place/{id}
    private static final Pattern NAVER_PLACE_PATH = Pattern.compile("/(?:place|restaurant|cafe|hairshop|accommodation|hospital|attraction|leisure|nailshop|beauty)/(\\d{1,20})(?:/|$)");
    // 네이버: ?pinId={id} (지도 공유에 섞여 온다)
    private static final Pattern NAVER_PIN_QUERY = Pattern.compile("(?:^|&)pinId=(\\d{1,20})(?:&|$)");

    /** 허용 호스트인가 — https 와 기본 포트(443)만, 사용자 정보(user@host) 금지 */
    public static boolean isAllowed(URI uri) {
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            return false;
        }
        if (uri.getRawUserInfo() != null) {
            return false;
        }
        if (uri.getPort() != -1 && uri.getPort() != 443) {
            return false;
        }
        String host = hostOf(uri);
        return host != null && ALLOWED_HOSTS.contains(host);
    }

    /** URL 에서 장소 id 를 꺼낸다 — 짧은 링크(kko.to·naver.me)처럼 경로에 없으면 비어 있다 */
    public static Optional<PlaceRef> extract(URI uri) {
        String host = hostOf(uri);
        if (host == null) {
            return Optional.empty();
        }
        String path = uri.getRawPath() == null ? "" : uri.getRawPath();
        String query = uri.getRawQuery() == null ? "" : uri.getRawQuery();
        switch (host) {
            case "place.map.kakao.com" -> {
                return first(KAKAO_PLACE_PATH.matcher(path)).map(id -> new PlaceRef(Provider.KAKAO, id));
            }
            case "map.kakao.com" -> {
                Optional<String> id = first(KAKAO_LINK_MAP_PATH.matcher(path));
                if (id.isEmpty()) {
                    id = first(KAKAO_ITEM_QUERY.matcher(query));
                }
                return id.map(v -> new PlaceRef(Provider.KAKAO, v));
            }
            case "map.naver.com", "m.place.naver.com" -> {
                Optional<String> id = first(NAVER_PLACE_PATH.matcher(path));
                if (id.isEmpty()) {
                    id = first(NAVER_PIN_QUERY.matcher(query));
                }
                return id.map(v -> new PlaceRef(Provider.NAVER, v));
            }
            default -> {
                return Optional.empty();
            }
        }
    }

    /** 어느 지도 링크인가 — id 를 못 꺼낸 짧은 링크도 지도 종류는 안다 */
    public static Optional<Provider> providerOf(URI uri) {
        String host = hostOf(uri);
        if (host == null) {
            return Optional.empty();
        }
        if (host.endsWith("kakao.com") || host.equals("kko.to")) {
            return Optional.of(Provider.KAKAO);
        }
        if (host.endsWith("naver.com") || host.equals("naver.me")) {
            return Optional.of(Provider.NAVER);
        }
        return Optional.empty();
    }

    static String hostOf(URI uri) {
        if (uri == null || uri.getHost() == null) {
            return null;
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        return host.endsWith(".") ? host.substring(0, host.length() - 1) : host;
    }

    private static Optional<String> first(Matcher m) {
        return m.find() ? Optional.of(m.group(1)) : Optional.empty();
    }
}
