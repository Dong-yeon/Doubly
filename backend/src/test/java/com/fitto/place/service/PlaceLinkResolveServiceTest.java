package com.fitto.place.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.place.domain.Place;
import com.fitto.place.dto.ResolvePlaceLinkResponse;
import com.fitto.place.repository.PlaceRepository;
import com.fitto.place.service.KakaoLocalClient.KakaoPlace;
import com.fitto.place.service.PlaceLinkFetcherTest.FakeTransport;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.net.InetAddress;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 링크 → 후보 — 페이지는 가짜 transport, 카카오 검색·DB 는 목. 스프링 컨텍스트를 띄우지 않는다
 * (컨텍스트가 하나 늘면 CI 힙이 모자랐던 전례, CLAUDE.md 6절).
 */
class PlaceLinkResolveServiceTest {

    private static final long USER = 1L;
    private static final long COUPLE = 77L;

    private FakeTransport transport;
    private KakaoLocalClient kakao;
    private PlaceRepository placeRepository;
    private PlaceLinkRateLimiter rateLimiter;
    private PlaceLinkResolveService service;

    @BeforeEach
    void setUp() throws Exception {
        transport = new FakeTransport();
        kakao = mock(KakaoLocalClient.class);
        placeRepository = mock(PlaceRepository.class);
        rateLimiter = mock(PlaceLinkRateLimiter.class);
        RelationRepository relationRepository = mock(RelationRepository.class);
        Relation couple = mock(Relation.class);
        when(couple.getId()).thenReturn(COUPLE);
        when(relationRepository.findByUserAndTypeAndStatus(USER, RelationType.COUPLE, RelationStatus.ACTIVE))
                .thenReturn(List.of(couple));
        when(placeRepository.findFirstByCoupleIdAndKakaoPlaceId(anyLong(), anyString())).thenReturn(Optional.empty());

        InetAddress pub = InetAddress.getByName("211.249.220.24");
        PlaceLinkFetcher fetcher = new PlaceLinkFetcher(transport, host -> new InetAddress[]{pub});
        service = new PlaceLinkResolveService(fetcher, kakao, placeRepository, relationRepository, rateLimiter);
    }

    private static KakaoPlace kp(String id, String name) {
        return new KakaoPlace(id, name, "서울 성동구 성수이로7길 26", "카페·디저트", 37.54, 127.05,
                "http://place.map.kakao.com/" + id);
    }

    private void kakaoPage(String id, String title, String address) {
        transport.route("https://place.map.kakao.com/" + id, new PlaceLinkTransport.Response(200, null,
                "<meta property=\"og:title\" content=\"" + title + "\">"
                        + "<meta property=\"og:description\" content=\"" + address + "\">"));
    }

    @Test
    void 카카오_링크는_id가_같은_검색_결과_하나로_확정한다() {
        kakaoPage("634902312", "누데이크 성수", "서울 성동구 성수동2가 309-59 1층");
        when(kakao.searchKeyword("누데이크 성수", 15))
                .thenReturn(List.of(kp("111", "누데이크 한남"), kp("634902312", "누데이크 성수")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/634902312");

        assertThat(r.provider()).isEqualTo("KAKAO");
        assertThat(r.matched()).isTrue();
        assertThat(r.ogTitle()).isEqualTo("누데이크 성수");
        assertThat(r.candidates()).singleElement().satisfies(c -> {
            assertThat(c.kakaoPlaceId()).isEqualTo("634902312");
            assertThat(c.existingPlaceId()).isNull();
        });
        assertThat(r.existingPlaceId()).isNull();
        verify(rateLimiter).check(USER);
    }

    @Test
    void 이름만으로_못_찾으면_주소_앞부분을_붙여_한_번_더_찾는다() {
        kakaoPage("9", "스타벅스", "서울 성동구 성수동 1");
        when(kakao.searchKeyword("스타벅스", 15)).thenReturn(List.of(kp("1", "스타벅스 강남")));
        when(kakao.searchKeyword("스타벅스 서울 성동구", 15)).thenReturn(List.of(kp("9", "스타벅스 성수")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/9");

        assertThat(r.matched()).isTrue();
        assertThat(r.candidates()).extracting(ResolvePlaceLinkResponse.Candidate::kakaoPlaceId).containsExactly("9");
    }

    @Test
    void 이미_럽슐랭에_있는_장소면_existingPlaceId를_채운다() {
        kakaoPage("634902312", "누데이크 성수", "서울 성동구 성수동2가");
        when(kakao.searchKeyword("누데이크 성수", 15)).thenReturn(List.of(kp("634902312", "누데이크 성수")));
        Place existing = mock(Place.class);
        when(existing.getId()).thenReturn(501L);
        when(placeRepository.findFirstByCoupleIdAndKakaoPlaceId(COUPLE, "634902312")).thenReturn(Optional.of(existing));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/634902312");

        assertThat(r.existingPlaceId()).isEqualTo(501L);
        assertThat(r.candidates().get(0).existingPlaceId()).isEqualTo(501L);
    }

    @Test
    void 네이버_링크는_이름과_지역으로_찾은_후보를_최대_3개_돌려준다() {
        transport.route("https://naver.me/abc", new PlaceLinkTransport.Response(302,
                "https://map.naver.com/p/entry/place/1857962284", ""));
        transport.route("https://m.place.naver.com/place/1857962284/home", new PlaceLinkTransport.Response(200, null,
                "<meta property=\"og:title\" content=\"못 MOAT : 네이버\"><script>\"roadAddress\":\"제주 제주시 구좌읍 1\"</script>"));
        when(kakao.searchKeyword("못 MOAT 제주 제주시", 3))
                .thenReturn(List.of(kp("1", "못 MOAT"), kp("2", "못 MOAT 2호점"), kp("3", "MOAT 카페")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://naver.me/abc");

        assertThat(r.provider()).isEqualTo("NAVER");
        assertThat(r.matched()).isFalse();
        assertThat(r.ogTitle()).isEqualTo("못 MOAT");
        assertThat(r.candidates()).hasSize(3);
        // 서로 다른 지도의 장소를 같은 곳이라고 단정하지 않는다 — 고르는 건 사용자
        assertThat(r.existingPlaceId()).isNull();
    }

    @Test
    void 지역을_붙여_못_찾으면_이름만으로_다시_찾는다() {
        transport.route("https://m.place.naver.com/restaurant/5/home", new PlaceLinkTransport.Response(200, null,
                "<meta property=\"og:title\" content=\"작은 식당 : 네이버\">\"roadAddress\":\"경기 성남시 분당구\""));
        when(kakao.searchKeyword("작은 식당 경기 성남시", 3)).thenReturn(List.of());
        when(kakao.searchKeyword("작은 식당", 3)).thenReturn(List.of(kp("8", "작은 식당")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://m.place.naver.com/restaurant/5/home");

        assertThat(r.candidates()).extracting(ResolvePlaceLinkResponse.Candidate::kakaoPlaceId).containsExactly("8");
    }

    @Test
    void 후보가_0건이면_빈_목록과_ogTitle을_돌려준다() {
        kakaoPage("1", "아무도 모르는 가게", "");
        when(kakao.searchKeyword(anyString(), anyInt())).thenReturn(List.of());

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/1");

        assertThat(r.candidates()).isEmpty();
        assertThat(r.matched()).isFalse();
        // 앱은 이 제목을 검색어로 채운 장소 추가 화면으로 보낸다
        assertThat(r.ogTitle()).isEqualTo("아무도 모르는 가게");
    }

    @Test
    void og_title이_없으면_검색하지_않고_빈_결과() {
        transport.route("https://place.map.kakao.com/1", new PlaceLinkTransport.Response(200, null, "<html></html>"));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/1");

        assertThat(r.candidates()).isEmpty();
        assertThat(r.ogTitle()).isNull();
        assertThat(r.provider()).isEqualTo("KAKAO");
        verify(kakao, never()).searchKeyword(anyString(), anyInt());
    }

    @Test
    void 페이지를_못_열면_예외_대신_빈_결과() {
        transport.failWith = new java.net.http.HttpTimeoutException("timeout");

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://kko.to/abc");

        assertThat(r.candidates()).isEmpty();
        assertThat(r.provider()).isEqualTo("KAKAO");
    }

    @Test
    void 허용되지_않은_링크는_열지도_검색하지도_않는다() {
        ResolvePlaceLinkResponse r = service.resolve(USER, "https://evil.example.com/x");

        assertThat(r.candidates()).isEmpty();
        assertThat(transport.opened).isEmpty();
        verify(kakao, never()).searchKeyword(anyString(), anyInt());
    }

    @Test
    void 레이트리밋에_걸리면_429를_그대로_던진다() {
        doThrow(new BusinessException(com.fitto.common.exception.ErrorCode.TOO_MANY_REQUESTS))
                .when(rateLimiter).check(eq(USER));

        assertThatThrownBy(() -> service.resolve(USER, "https://place.map.kakao.com/1"))
                .isInstanceOf(BusinessException.class);
        assertThat(transport.opened).isEmpty();
    }

    @Test
    void 네이버_페이지가_막히면_공유_메시지의_이름과_주소로_후보를_찾는다() {
        transport.route("https://naver.me/abc", new PlaceLinkTransport.Response(302,
                "https://map.naver.com/p/entry/place/1857962284", ""));
        transport.route("https://m.place.naver.com/place/1857962284/home", new PlaceLinkTransport.Response(429, null, ""));
        when(kakao.searchKeyword("못 MOAT 제주 제주시", 3)).thenReturn(List.of(kp("1", "못 MOAT")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://naver.me/abc",
                "[네이버 지도]\n못 MOAT\n제주 제주시 구좌읍 해맞이해안로 1\nhttps://naver.me/abc");

        assertThat(r.provider()).isEqualTo("NAVER");
        assertThat(r.ogTitle()).isEqualTo("못 MOAT");
        assertThat(r.candidates()).extracting(ResolvePlaceLinkResponse.Candidate::kakaoPlaceId).containsExactly("1");
    }

    @Test
    void 카카오_페이지가_막혀도_링크의_id와_공유_메시지_이름으로_확정한다() {
        transport.route("https://place.map.kakao.com/634902312", new PlaceLinkTransport.Response(403, null, ""));
        when(kakao.searchKeyword("누데이크 성수", 15)).thenReturn(List.of(kp("634902312", "누데이크 성수")));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://place.map.kakao.com/634902312",
                "[카카오맵] 누데이크 성수\n서울 성동구 성수이로7길 26\nhttps://place.map.kakao.com/634902312");

        assertThat(r.matched()).isTrue();
        assertThat(r.candidates()).singleElement().extracting(ResolvePlaceLinkResponse.Candidate::kakaoPlaceId)
                .isEqualTo("634902312");
    }

    @Test
    void 평범한_대화는_이름으로_검색하지_않는다() {
        transport.route("https://m.place.naver.com/place/1/home", new PlaceLinkTransport.Response(429, null, ""));

        ResolvePlaceLinkResponse r = service.resolve(USER, "https://m.place.naver.com/place/1/home",
                "여기 가보자 https://m.place.naver.com/place/1/home");

        assertThat(r.candidates()).isEmpty();
        assertThat(r.ogTitle()).isNull();
        verify(kakao, never()).searchKeyword(anyString(), anyInt());
    }

    @Test
    void 막힌_링크는_공유_메시지가_있어도_우회하지_않는다() throws Exception {
        InetAddress internal = InetAddress.getByName("10.0.0.1");
        PlaceLinkFetcher privateDns = new PlaceLinkFetcher(transport, host -> new InetAddress[]{internal});
        RelationRepository relations = mock(RelationRepository.class);
        Relation couple = mock(Relation.class);
        when(couple.getId()).thenReturn(COUPLE);
        when(relations.findByUserAndTypeAndStatus(USER, RelationType.COUPLE, RelationStatus.ACTIVE)).thenReturn(List.of(couple));
        PlaceLinkResolveService s = new PlaceLinkResolveService(privateDns, kakao, placeRepository, relations, rateLimiter);

        ResolvePlaceLinkResponse r = s.resolve(USER, "https://kko.to/a", "[카카오맵] 어떤 가게\n서울 성동구 1");

        assertThat(r.candidates()).isEmpty();
        verify(kakao, never()).searchKeyword(anyString(), anyInt());
    }
}
