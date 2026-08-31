package com.fitto.content.dto;

import com.fitto.content.domain.Content;
import com.fitto.content.domain.ContentType;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 콘텐츠 응답 — 관람 요약(횟수·평균 별점·최근 관람일) + 럽슐랭 평가(나/상대 대표 평점·등급) +
 * 매거진 카드용 커버(최근 관람기록의 사진·메모) 포함. {@link com.fitto.place.dto.PlaceResponse}
 * 와 같은 모양이나 좌표·주소·카테고리·tripId 가 없다. posterUrl 은 TMDB 검색으로 채워지거나
 * 직접 입력 시 null 일 수 있다.
 */
public record ContentResponse(
        Long id,
        String title,
        ContentType type,
        Long addedBy,
        String posterUrl,
        long logCount,
        Double avgRating,
        LocalDate lastWatchedAt,
        Integer myRating,
        Integer partnerRating,
        int lovelichelinTier,
        LocalDateTime lovelichelinCertifiedAt,
        String coverImageUrl,
        String coverMemo,
        LocalDateTime createdAt
) {
    public static ContentResponse of(Content c, long logCount, Double avgRating, LocalDate lastWatchedAt,
                                     Integer myRating, Integer partnerRating,
                                     String coverImageUrl, String coverMemo) {
        return new ContentResponse(c.getId(), c.getTitle(), c.getType(), c.getAddedBy(),
                c.getPosterUrl(), logCount, avgRating, lastWatchedAt, myRating, partnerRating,
                c.getLovelichelinTier(), c.getLovelichelinCertifiedAt(),
                coverImageUrl, coverMemo, c.getCreatedAt());
    }
}
