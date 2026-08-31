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
