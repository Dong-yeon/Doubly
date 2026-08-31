package com.fitto.place.dto;

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
        LocalDateTime createdAt
) {
    public static PlaceResponse of(Place p, long visitCount, Double avgRating, LocalDate lastVisitedAt,
                                   Integer myRating, Integer partnerRating,
                                   String coverImageUrl, String coverMemo) {
        return new PlaceResponse(p.getId(), p.getName(), p.getAddress(), p.getLat(), p.getLng(),
                p.getCategory(), p.getAddedBy(), p.getTripId(),
                visitCount, avgRating, lastVisitedAt, myRating, partnerRating,
                p.getLovelichelinTier(), p.getLovelichelinCertifiedAt(),
                coverImageUrl, coverMemo, p.getCreatedAt());
    }
}
