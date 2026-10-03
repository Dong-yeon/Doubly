package com.fitto.common.upload;

import java.time.Duration;
import java.time.Instant;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 앱이 "올렸지만 쓰지 않은" 사진을 치워 달라고 할 때 — 지워도 되는 URL 인가.
 *
 * <p>업로드는 앱이 Cloudinary 로 직접 보낸다(서명 업로드). 서명에는 폴더만 있고 올린 사람이 없어서 서버는 그 파일이
 * <b>누구 것인지 모른다</b>. 그래서 "지워 달라"는 요청을 그대로 믿지 않고 세 겹으로 좁힌다:
 * <ol>
 *   <li>앱 업로드 폴더 <b>바로 아래</b>의 원본 이미지만({@link CloudinaryUrls#isImageDirectlyIn}) — 서버가 관리하는
 *       하위 폴더(하루 기록·이모지 원본 등)는 이 경로로 못 지운다.</li>
 *   <li>URL 의 버전 세그먼트({@code v{업로드 시각, 초}})가 <b>최근 {@value #FRESH_HOURS}시간 안</b>일 것 — 막 올린
 *       사진만. 오래된 파일은 이 경로로 못 지운다.</li>
 *   <li>어떤 행도 쓰지 않을 것 — 삭제기({@link CloudinaryImageDeleter#deleteAll})가 지우기 직전에 다시 본다.</li>
 * </ol>
 * 남의 막 올린 사진을 지우려면 그 URL 을 알아야 하는데, URL 은 저장(=참조)되기 전엔 올린 사람만 안다.
 */
public final class UploadDiscardPolicy {

    static final long FRESH_HOURS = 24;

    /** 버전 세그먼트 — Cloudinary 가 업로드 시각(유닉스 초)으로 붙인다 */
    private static final Pattern VERSION = Pattern.compile("/upload/v([0-9]{9,11})/");

    private UploadDiscardPolicy() {
    }

    public static boolean isDiscardable(String url, CloudinaryProperties properties, Instant now) {
        if (!CloudinaryUrls.isImageDirectlyIn(url, properties, properties.getFolder())) {
            return false;
        }
        Matcher m = VERSION.matcher(url);
        if (!m.find()) {
            return false;
        }
        Instant uploadedAt = Instant.ofEpochSecond(Long.parseLong(m.group(1)));
        Duration age = Duration.between(uploadedAt, now);
        // 시계가 조금 어긋나 미래로 찍힌 것은 막 올린 것으로 본다(5분까지)
        return !age.isNegative() ? age.compareTo(Duration.ofHours(FRESH_HOURS)) <= 0
                : age.abs().compareTo(Duration.ofMinutes(5)) <= 0;
    }
}
