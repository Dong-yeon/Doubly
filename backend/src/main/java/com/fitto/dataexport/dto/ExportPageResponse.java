package com.fitto.dataexport.dto;

import java.util.List;
import java.util.Map;

/**
 * 섹션 한 페이지. {@code items} 는 테이블 행 그대로(컬럼 이름 소문자),
 * {@code nextCursor} 가 null 이면 끝이다.
 */
public record ExportPageResponse(String section, List<Map<String, Object>> items,
                                 List<ExportMedia> media, Long nextCursor) {
}
