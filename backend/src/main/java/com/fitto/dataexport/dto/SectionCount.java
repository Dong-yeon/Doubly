package com.fitto.dataexport.dto;

/** 섹션 하나의 건수와 그 안의 파일(사진·음성) 수. */
public record SectionCount(String key, String scope, long count, long mediaCount) {
}
