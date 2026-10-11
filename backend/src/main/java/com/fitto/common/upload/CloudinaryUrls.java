package com.fitto.common.upload;

import java.util.regex.Pattern;

/**
 * "우리가 올린 원본 파일의 URL 인가" 판정.
 *
 * <p>우리가 올린 파일의 URL 은 모두 Cloudinary 가 돌려준 {@code secure_url} 그대로다 —
 * {@code https://res.cloudinary.com/{cloud}/{image|video}/upload/v{버전}/{루트 폴더}/…/{id}.{ext}}.
 * 앱의 서명 업로드든 서버 업로드({@link CloudinaryImageUploader})든 폴더는 전부
 * {@link CloudinaryProperties#getFolder()} 아래다.
 *
 * <p><b>왜 형태까지 보나</b>: 삭제기는 URL 에서 public_id 만 뽑아 우리 클라우드에 destroy 를 보낸다.
 * 그래서 남의 사진 public_id 를 담은 <b>변형 URL</b> — 다른 cloud 이름, 변환 세그먼트
 * ({@code /upload/w_100/…}), {@code ..} — 을 기록에 넣었다가 지우면 그 원본이 지워질 수 있었다.
 * "아직 쓰는 행이 있으면 남긴다"는 참조 확인({@link StoredMediaReferences})은 문자열이 정확히 같을
 * 때만 걸려서 변형 URL 을 막지 못한다(docs/daily-mood-current-state.md §8-6). 원본 형태만 인정하면
 * 같은 파일을 가리키는 URL 이 하나로 고정되고, 참조 확인이 다시 제 역할을 한다.
 */
public final class CloudinaryUrls {

    private CloudinaryUrls() {
    }

    /** 파일 이름 한 칸 — 경로 구분자·쿼리·프래그먼트가 없는 것 */
    private static final String SEGMENT = "[^/?#]+";

    /**
     * 루트 폴더 아래(깊이 무관)의 원본 파일인가 — 삭제기가 지워도 되는 URL.
     * 이미지·오디오(video) 둘 다 해당한다.
     */
    public static boolean isOwnOriginal(String url, CloudinaryProperties properties) {
        return matches(url, properties, "(?:image|video)", properties.getFolder(), "(?:" + SEGMENT + "/)*" + SEGMENT);
    }

    /**
     * 정확히 {@code folder} 바로 아래의 원본 이미지인가 — 하위 폴더(journal/, emoji-source/ 등)는 아니다.
     * 기록 저장 시점에 "이 기능의 업로드 경로로 올린 사진"인지 볼 때 쓴다.
     */
    public static boolean isImageDirectlyIn(String url, CloudinaryProperties properties, String folder) {
        return matches(url, properties, "image", folder, SEGMENT);
    }

    private static boolean matches(String url, CloudinaryProperties properties, String type,
                                   String folder, String rest) {
        if (url == null || url.contains("..") || properties.getCloudName().isBlank()) {
            return false;
        }
        Pattern pattern = Pattern.compile("^https://res\\.cloudinary\\.com/"
                + Pattern.quote(properties.getCloudName()) + "/" + type + "/upload/(?:v\\d+/)?"
                + Pattern.quote(folder) + "/" + rest + "$");
        return pattern.matcher(url).matches();
    }
}
