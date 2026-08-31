package com.fitto.place.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

/**
 * 장소 등록 요청 — POST /places. kakaoPlaceId 를 함께 보내면(카카오 검색 결과를 그대로
 * 저장하는 경로) 같은 커플 안에 이미 그 장소가 있을 때 PlaceService.save()가 새로
 * 만들지 않고 기존 장소를 재사용한다 — 없으면(직접 입력 등) 이름+주소로만 대조한다.
 */
public record SavePlaceRequest(
        @NotBlank(message = "장소 이름은 필수입니다.")
        @Size(max = 100, message = "장소 이름은 100자 이내로 입력해주세요.")
        String name,

        String address,

        BigDecimal lat,

        BigDecimal lng,

        @Size(max = 30, message = "카테고리는 30자 이내로 입력해주세요.")
        String category,

        @Size(max = 50, message = "kakaoPlaceId 가 올바르지 않습니다.")
        String kakaoPlaceId
) {
    /** kakaoPlaceId 없이 저장하던 기존 호출부(테스트 등) 호환용 */
    public SavePlaceRequest(String name, String address, BigDecimal lat, BigDecimal lng, String category) {
        this(name, address, lat, lng, category, null);
    }
}
