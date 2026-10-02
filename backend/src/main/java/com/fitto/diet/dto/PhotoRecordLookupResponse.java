package com.fitto.diet.dto;

import java.time.LocalDate;

/** 같은 사진으로 남긴 내 식단 — 없으면 recorded=false, 나머지 null */
public record PhotoRecordLookupResponse(boolean recorded, Long mealId, LocalDate mealDate, String mealTypeLabel) {
    public static PhotoRecordLookupResponse none() {
        return new PhotoRecordLookupResponse(false, null, null, null);
    }
}
