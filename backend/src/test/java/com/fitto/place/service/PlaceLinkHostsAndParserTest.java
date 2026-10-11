package com.fitto.place.service;

import com.fitto.place.service.PlaceLinkHosts.PlaceRef;
import com.fitto.place.service.PlaceLinkHosts.Provider;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/** URL → 장소 id, 페이지 → 가게 이름 — 순수 함수만 */
class PlaceLinkHostsAndParserTest {

    private static Optional<PlaceRef> ref(String url) {
        return PlaceLinkHosts.extract(URI.create(url));
    }

    @Test
    void 카카오_링크에서_장소_id를_꺼낸다() {
        assertThat(ref("https://place.map.kakao.com/634902312")).contains(new PlaceRef(Provider.KAKAO, "634902312"));
        assertThat(ref("https://place.map.kakao.com/m/634902312")).contains(new PlaceRef(Provider.KAKAO, "634902312"));
        assertThat(ref("https://map.kakao.com/link/map/18577297")).contains(new PlaceRef(Provider.KAKAO, "18577297"));
        assertThat(ref("https://map.kakao.com/?urlX=1&itemId=8173414&q=x")).contains(new PlaceRef(Provider.KAKAO, "8173414"));
        // 짧은 링크·id 없는 지도 링크는 아직 모른다
        assertThat(ref("https://kko.to/abc")).isEmpty();
        assertThat(ref("https://map.kakao.com/?q=맛집")).isEmpty();
        assertThat(ref("https://map.kakao.com/link/map/누데이크,37.5,127.0")).isEmpty();
    }

    @Test
    void 네이버_링크에서_장소_id를_꺼낸다() {
        assertThat(ref("https://map.naver.com/p/entry/place/1857962284?c=15")).contains(new PlaceRef(Provider.NAVER, "1857962284"));
        assertThat(ref("https://map.naver.com/v5/entry/place/1857962284")).contains(new PlaceRef(Provider.NAVER, "1857962284"));
        assertThat(ref("https://m.place.naver.com/restaurant/1857962284/home?entry=pll")).contains(new PlaceRef(Provider.NAVER, "1857962284"));
        assertThat(ref("https://m.place.naver.com/cafe/42")).contains(new PlaceRef(Provider.NAVER, "42"));
        assertThat(ref("https://map.naver.com/p/search/맛집?pinId=77")).contains(new PlaceRef(Provider.NAVER, "77"));
        assertThat(ref("https://naver.me/5abc")).isEmpty();
    }

    @Test
    void 허용_호스트는_정확히_일치해야_한다() {
        assertThat(PlaceLinkHosts.isAllowed(URI.create("https://PLACE.MAP.KAKAO.COM/1"))).isTrue();
        assertThat(PlaceLinkHosts.isAllowed(URI.create("https://place.map.kakao.com./1"))).isTrue();
        assertThat(PlaceLinkHosts.isAllowed(URI.create("https://evil-kko.to/1"))).isFalse();
        assertThat(PlaceLinkHosts.isAllowed(URI.create("https://www.instagram.com/p/x"))).isFalse();
        assertThat(PlaceLinkHosts.isAllowed(URI.create("https://kko.to:443/a"))).isTrue();
    }

    @Test
    void 카카오_페이지에서_이름과_주소를_읽는다() {
        String html = "<head><meta property=\"og:title\" content=\"누데이크 성수\">"
                + "<meta content=\"서울 성동구 성수동2가 309-59 1층\" property=\"og:description\"></head>";

        PlaceLinkPageParser.Parsed p = PlaceLinkPageParser.parse(html, Provider.KAKAO);

        assertThat(p.title()).isEqualTo("누데이크 성수");
        assertThat(p.addressHint()).isEqualTo("서울 성동구 성수동2가 309-59 1층");
        assertThat(PlaceLinkPageParser.regionOf(p.addressHint())).isEqualTo("서울 성동구");
    }

    @Test
    void 네이버_제목의_접미사를_떼고_JSON_주소를_읽는다() {
        String html = "<meta property=\"og:title\" content=\"못 MOAT : 네이버\" />"
                + "<meta property=\"og:description\" content=\"방문자리뷰 117 · 블로그리뷰 82\" />"
                + "<script>{\"roadAddress\":\"제주 제주시 구좌읍 해맞이해안로 1\"}</script>";

        PlaceLinkPageParser.Parsed p = PlaceLinkPageParser.parse(html, Provider.NAVER);

        assertThat(p.title()).isEqualTo("못 MOAT");
        // og:description 은 리뷰 수라 주소로 쓰지 않는다
        assertThat(p.addressHint()).isEqualTo("제주 제주시 구좌읍 해맞이해안로 1");
    }

    @Test
    void 서비스_이름뿐인_og_title은_이름으로_쓰지_않는다() {
        assertThat(PlaceLinkPageParser.parse("<meta property=\"og:title\" content=\"카카오맵\">", Provider.KAKAO).title()).isNull();
        assertThat(PlaceLinkPageParser.parse("<meta property=\"og:title\" content=\"네이버지도\">", Provider.NAVER).title()).isNull();
    }

    @Test
    void og_태그가_없으면_비어_있다() {
        PlaceLinkPageParser.Parsed p = PlaceLinkPageParser.parse("<html><title>네이버 플레이스</title></html>", Provider.NAVER);
        assertThat(p.title()).isNull();
        assertThat(p.addressHint()).isNull();
        assertThat(PlaceLinkPageParser.parse(null, Provider.KAKAO).title()).isNull();
    }

    @Test
    void HTML_엔티티를_푼다() {
        String html = "<meta property='og:title' content='Tom &amp; Jerry&#39;s &#xD55C;식'>";
        assertThat(PlaceLinkPageParser.parse(html, Provider.KAKAO).title()).isEqualTo("Tom & Jerry's 한식");
    }

    @Test
    void 공유_문구에서_이름과_주소를_꺼낸다() {
        PlaceLinkPageParser.Parsed naver = PlaceLinkPageParser.fromShareText(
                "[네이버 지도]\n못 MOAT\n제주 제주시 구좌읍 해맞이해안로 1\nhttps://naver.me/5abc");
        assertThat(naver.title()).isEqualTo("못 MOAT");
        assertThat(naver.addressHint()).isEqualTo("제주 제주시 구좌읍 해맞이해안로 1");

        PlaceLinkPageParser.Parsed kakao = PlaceLinkPageParser.fromShareText(
                "[카카오맵] 누데이크 성수\r\n서울 성동구 성수이로7길 26\r\nhttps://kko.to/abc");
        assertThat(kakao.title()).isEqualTo("누데이크 성수");
        assertThat(kakao.addressHint()).isEqualTo("서울 성동구 성수이로7길 26");

        // 머리표 없이 이름·주소만 붙여 넣은 경우도 주소 줄이 있으면 믿는다
        PlaceLinkPageParser.Parsed bare = PlaceLinkPageParser.fromShareText(
                "서울숲 카페 온더\n서울특별시 성동구 서울숲2길 1\nhttps://naver.me/x");
        assertThat(bare.title()).isEqualTo("서울숲 카페 온더");
        assertThat(bare.addressHint()).isEqualTo("서울특별시 성동구 서울숲2길 1");
    }

    @Test
    void 공유_문구가_아닌_대화는_이름으로_보지_않는다() {
        assertThat(PlaceLinkPageParser.fromShareText("여기 가보자 https://naver.me/x").title()).isNull();
        assertThat(PlaceLinkPageParser.fromShareText("https://naver.me/x").title()).isNull();
        assertThat(PlaceLinkPageParser.fromShareText(null).title()).isNull();
        // "서울숲" 으로 시작해도 두 번째 말이 시·군·구가 아니면 주소가 아니다
        assertThat(PlaceLinkPageParser.fromShareText("서울숲 가자 https://naver.me/x").title()).isNull();
    }
}
