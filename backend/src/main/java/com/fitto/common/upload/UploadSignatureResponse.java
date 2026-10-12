package com.fitto.common.upload;

/**
 * 업로드 발급 결과 (apiSecret 은 제외).
 *
 * <p>{@code provider} 로 갈린다(2026-10-12 R2 전환):
 * <ul>
 *   <li>{@code cloudinary} — 앞의 다섯 값으로 Cloudinary 에 서명 업로드(옛 앱은 이 다섯 값만 안다)</li>
 *   <li>{@code r2} — {@code uploadUrl} 로 {@code contentType} 을 붙여 PUT, 저장할 주소는 {@code publicUrl}</li>
 * </ul>
 */
public record UploadSignatureResponse(
        String cloudName,
        String apiKey,
        long timestamp,
        String folder,
        String signature,
        String provider,
        String uploadUrl,
        String publicUrl,
        String contentType
) {
    /** Cloudinary 서명 — 기존 호출부(CloudinarySigner)가 쓰던 모양 그대로 */
    public UploadSignatureResponse(String cloudName, String apiKey, long timestamp, String folder, String signature) {
        this(cloudName, apiKey, timestamp, folder, signature, "cloudinary", null, null, null);
    }

    public static UploadSignatureResponse r2(R2Storage.UploadTarget target, String folder) {
        return new UploadSignatureResponse(null, null, 0, folder, null,
                "r2", target.uploadUrl(), target.publicUrl(), target.contentType());
    }
}
