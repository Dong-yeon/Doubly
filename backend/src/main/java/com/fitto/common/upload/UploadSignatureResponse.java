package com.fitto.common.upload;

/** 클라이언트가 Cloudinary 에 서명 업로드할 때 쓰는 값 (apiSecret 은 제외) */
public record UploadSignatureResponse(
        String cloudName,
        String apiKey,
        long timestamp,
        String folder,
        String signature
) {
}
