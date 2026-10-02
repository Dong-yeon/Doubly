package com.fitto.feed.dto;

import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;

/**
 * 일상 포스트 고치기 — 글·사진·기록일을 <b>통째로</b> 보낸다(PUT). 빠진 사진은 지운 것으로 본다.
 * 글·사진 중 하나는 필수, 사진은 최대 5장(서비스 검증 — {@code FeedService.validatedPhotos}).
 *
 * @param recordDate 없으면 오늘(작성과 같은 규칙) — 앱은 항상 보낸다
 */
public record UpdatePostRequest(
        @Size(max = 2000, message = "글은 2000자 이내로 작성해주세요.")
        String content,
        List<@Size(max = 500) String> imageUrls,
        LocalDate recordDate
) {
}
