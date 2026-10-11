package com.fitto.place.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fitto.place.domain.Place;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 장소 응답 — 방문 요약(횟수·평균 별점·최근 방문일) + 럽슐랭 평가(나/상대 대표 평점·등급) +
 * 매거진 카드용 커버(최근 방문기록의 사진·메모) 포함.
 *
 * <p>{@code avgRating} 은 방문기록(place_visits) 전체의 blended 평균이고,
 * {@code myRating}/{@code partnerRating} 은 장소당 한 사람당 1개인 럽슐랭 대표 평점이다 —
 * 서로 다른 값이니 섞어 쓰지 말 것. {@code coverImageUrl}/{@code coverMemo} 는 사진이 있는
 * 가장 최근 방문기록(없으면 그냥 가장 최근 방문기록)에서 뽑는다.
 */
public record PlaceResponse(
        Long id,
        String name,
        String address,
        BigDecimal lat,
        BigDecimal lng,
        String category,
        Long addedBy,
        Long tripId,
        long visitCount,
        Double avgRating,
        LocalDate lastVisitedAt,
        Integer myRating,
        Integer partnerRating,
        int lovelichelinTier,
        LocalDateTime lovelichelinCertifiedAt,
        String coverImageUrl,
        String coverMemo,
        LocalDateTime createdAt,
        /** 무엇을 파는 곳인지(V130) — 없으면 null */
        String categoryDetail,
        /** 전화번호(V130) — 있을 때만 상세에 [전화] */
        String phone,
        /** 카카오 상세 링크 — 저장하지 않고 kakao_place_id 로 만든다(PlaceLinks). 없으면 null(앱이 검색 URL 로 대신 연다) */
        String detailUrl,
        /**
         * 저장(POST /places) 응답에만 실린다 — true 면 새로 만든 장소, false 면 같은 커플에 이미 있던
         * 장소를 돌려준 것이다(중복 방지). 목록·상세 등 다른 응답에서는 null 이라 직렬화되지 않는다.
         */
        @JsonInclude(JsonInclude.Include.NON_NULL)
        Boolean created
) {
    public static PlaceResponse of(Place p, long visitCount, Double avgRating, LocalDate lastVisitedAt,
                                   Integer myRating, Integer partnerRating,
                                   String coverImageUrl, String coverMemo) {
        return new PlaceResponse(p.getId(), p.getName(), p.getAddress(), p.getLat(), p.getLng(),
                p.getCategory(), p.getAddedBy(), p.getTripId(),
                visitCount, avgRating, lastVisitedAt, myRating, partnerRating,
                p.getLovelichelinTier(), p.getLovelichelinCertifiedAt(),
                coverImageUrl, coverMemo, p.getCreatedAt(), p.getCategoryDetail(), p.getPhone(),
                com.fitto.place.service.PlaceLinks.detailUrl(p.getKakaoPlaceId()), null);
    }

    /** 저장 응답 — 새로 만들었는지(created) 를 함께 싣는다 */
    public PlaceResponse withCreated(boolean created) {
        return new PlaceResponse(id, name, address, lat, lng, category, addedBy, tripId, visitCount, avgRating,
                lastVisitedAt, myRating, partnerRating, lovelichelinTier, lovelichelinCertifiedAt,
                coverImageUrl, coverMemo, createdAt, categoryDetail, phone, detailUrl, created);
    }
}
