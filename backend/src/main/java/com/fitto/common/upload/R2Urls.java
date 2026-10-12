package com.fitto.common.upload;

import java.time.Instant;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * "우리가 R2 에 올린 원본 파일의 주소인가" — {@link CloudinaryUrls} 의 R2 짝.
 *
 * <p>앱이 R2 로 올린 파일 주소는 {@code {공개 주소}/{폴더}/{업로드 시각(초)}-{무작위}.{확장자}} 하나뿐이다
 * ({@link R2Storage#presignUpload}). 형태까지 보는 이유는 Cloudinary 와 같다 — 삭제기는 주소에서 키를 뽑아 지우므로,
 * 변형 주소({@code ..}, 쿼리, 다른 호스트)로 남의 파일을 지우는 길을 막아야 하고, 참조 확인(StoredMediaReferences)은
 * 문자열이 정확히 같을 때만 걸리기 때문이다.
 */
public final class R2Urls {

    private R2Urls() {
    }

    private static final String SEGMENT = "[^/?#]+";
    /** 앱 업로드 파일 이름 — 업로드 시각(초)이 앞에 있어 "막 올린 파일"을 가릴 수 있다 */
    private static final Pattern UPLOAD_NAME = Pattern.compile("^([0-9]{9,11})-[A-Za-z0-9]{8,64}\\.(jpg|png|webp|heic|gif)$");

    /** 루트 폴더 아래(깊이 무관)의 우리 파일인가 — 삭제기가 지워도 되는 주소 */
    public static boolean isOwnOriginal(String url, R2Properties r2, String rootFolder) {
        return keyOf(url, r2)
                .filter(key -> key.startsWith(rootFolder + "/"))
                .filter(key -> key.substring(rootFolder.length() + 1).matches("(?:" + SEGMENT + "/)*" + SEGMENT))
                .isPresent();
    }

    /** 정확히 {@code folder} 바로 아래의, 앱이 올린 이미지인가 — 저장 시점 검증·버리기 판정에 쓴다 */
    public static boolean isImageDirectlyIn(String url, R2Properties r2, String folder) {
        return keyOf(url, r2)
                .filter(key -> key.startsWith(folder + "/"))
                .map(key -> key.substring(folder.length() + 1))
                .filter(name -> UPLOAD_NAME.matcher(name).matches())
                .isPresent();
    }

    /** 파일 이름에 박힌 업로드 시각 — 앱 업로드 형태가 아니면 빈 값 */
    public static Optional<Instant> uploadedAt(String url, R2Properties r2) {
        return keyOf(url, r2).map(key -> key.substring(key.lastIndexOf('/') + 1)).flatMap(name -> {
            Matcher m = UPLOAD_NAME.matcher(name);
            return m.matches() ? Optional.of(Instant.ofEpochSecond(Long.parseLong(m.group(1)))) : Optional.empty();
        });
    }

    /** 공개 주소에서 객체 키 — 우리 공개 주소가 아니거나 모양이 이상하면 빈 값 */
    public static Optional<String> keyOf(String url, R2Properties r2) {
        String base = r2.getPublicBaseUrl();
        if (url == null || base == null || base.isBlank() || !url.startsWith(base + "/")) {
            return Optional.empty();
        }
        String key = url.substring(base.length() + 1);
        if (key.isEmpty() || key.contains("..") || key.contains("?") || key.contains("#")
                || key.contains("//") || key.contains("%") || key.contains("\\")) {
            return Optional.empty();
        }
        return Optional.of(key);
    }

    /** R2 공개 주소인가(모양 검사 없이 호스트만) — Cloudinary 주소와 갈라 처리할 때 */
    public static boolean isR2Url(String url, R2Properties r2) {
        String base = r2.getPublicBaseUrl();
        return url != null && base != null && !base.isBlank() && url.startsWith(base + "/");
    }
}
