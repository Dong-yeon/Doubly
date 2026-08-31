package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.config.KakaoLocalProperties;
import com.fitto.place.service.KakaoLocalClient.KakaoPlace;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 카카오 로컬 documents[] 매핑 — HTTP 없는 순수 단위 테스트
 * ({@code FoodDbClientMappingTest} 와 같은 패턴).
 */
class KakaoLocalClientMappingTest {

    private final KakaoLocalClient client = new KakaoLocalClient(new KakaoLocalProperties());
    private final ObjectMapper objectMapper = new ObjectMapper();

    private JsonNode doc(String json) throws Exception {
        return objectMapper.readTree(json);
    }

    @Test
    void 정상_응답을_매핑한다() throws Exception {
        JsonNode document = doc("""
                {
                  "id": "987654321",
                  "place_name": "연남 파스타집",
                  "category_name": "음식점 > 양식 > 이탈리안",
                  "road_address_name": "서울 마포구 동교로 123",
                  "address_name": "서울 마포구 연남동 1-1",
                  "x": "126.923456",
                  "y": "37.561234",
                  "place_url": "http://place.map.kakao.com/12345"
                }
                """);

        KakaoPlace place = client.mapDocument(document);

        assertThat(place.id()).isEqualTo("987654321");
        assertThat(place.name()).isEqualTo("연남 파스타집");
        assertThat(place.category()).isEqualTo("음식점"); // 최상위 단계 — 국가별 세분류는 더 이상 안 남긴다
        assertThat(place.address()).isEqualTo("서울 마포구 동교로 123"); // 도로명 우선
        assertThat(place.lat()).isEqualTo(37.561234); // 카카오는 y=위도
        assertThat(place.lng()).isEqualTo(126.923456);
        assertThat(place.placeUrl()).isEqualTo("http://place.map.kakao.com/12345");
    }

    @Test
    void 도로명이_없으면_지번_주소로_폴백한다() throws Exception {
        JsonNode document = doc("""
                {
                  "place_name": "골목 국숫집",
                  "category_name": "음식점",
                  "road_address_name": "",
                  "address_name": "서울 마포구 연남동 2-2",
                  "x": "126.9",
                  "y": "37.5"
                }
                """);

        KakaoPlace place = client.mapDocument(document);

        assertThat(place.address()).isEqualTo("서울 마포구 연남동 2-2");
        assertThat(place.category()).isEqualTo("음식점"); // 단계가 하나면 그대로
        assertThat(place.placeUrl()).isNull();
    }

    // 회귀 테스트 — category_group_code 가 있으면 category_name 의 애매한 2차 분류
    // 문구 대신 앱의 7개 카테고리 중 하나로 정확히 맞춰야 한다(2026-08-31, 없어서
    // "커피전문점" 같은 문구가 그대로 나가 목록 카테고리 칩에서 안 보이던 문제).
    @Test
    void category_group_code가_있으면_앱_카테고리로_정확히_맞춘다() throws Exception {
        JsonNode cafe = doc("""
                {
                  "place_name": "동네 카페",
                  "category_name": "음식점 > 카페 > 커피전문점",
                  "category_group_code": "CE7",
                  "address_name": "서울 마포구"
                }
                """);

        assertThat(client.mapDocument(cafe).category()).isEqualTo("카페·디저트");
    }

    // group code 가 앱이 다루는 5개 밖이면(예: 어린이집) 억지로 끼워맞추지 않고 비워둔다 —
    // "음식점"이 아닌 이상 텍스트로 추측하지 않는다.
    @Test
    void 지원하지_않는_group_code는_카테고리를_비워둔다() throws Exception {
        JsonNode nursery = doc("""
                {
                  "place_name": "어딘가의 어린이집",
                  "category_name": "교육,학문 > 어린이집",
                  "category_group_code": "PS3",
                  "address_name": "서울 마포구"
                }
                """);

        assertThat(client.mapDocument(nursery).category()).isNull();
    }

    @Test
    void 이름이_없거나_좌표가_깨져도_안전하다() throws Exception {
        assertThat(client.mapDocument(doc("{\"place_name\": \"\"}"))).isNull();

        KakaoPlace broken = client.mapDocument(doc("""
                {"place_name": "이름만 있는 곳", "x": "not-a-number", "y": ""}
                """));
        assertThat(broken.name()).isEqualTo("이름만 있는 곳");
        assertThat(broken.id()).isNull(); // id 없이 오면 null — 중복 대조는 이름+좌표/주소 폴백으로
        assertThat(broken.lat()).isNull();
        assertThat(broken.lng()).isNull();
        assertThat(broken.address()).isNull();
        assertThat(broken.category()).isNull();
    }
}
