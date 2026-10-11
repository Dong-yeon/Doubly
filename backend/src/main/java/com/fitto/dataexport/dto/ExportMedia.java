package com.fitto.dataexport.dto;

/**
 * 받을 파일 하나 — 앱이 Cloudinary 에서 직접 받는다.
 *
 * @param section 어느 섹션의 행인가({@code feed_posts})
 * @param rowId   그 행의 id — ZIP 안의 파일 이름과 index.html 의 연결 고리
 * @param column  URL 이 있던 컬럼(음성 메시지는 {@code content})
 * @param kind    IMAGE / AUDIO
 */
public record ExportMedia(String section, long rowId, String column, String url, String kind) {
}
