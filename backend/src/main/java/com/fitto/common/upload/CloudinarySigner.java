package com.fitto.common.upload;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Cloudinary 서명 발급 — 사진(UploadController)과 음성 클립(VoiceClipController)이
 * 같은 Cloudinary 계정·같은 서명 규칙을 쓰므로 한 곳에 모은다.
 *
 * <p>업로드 한도(PlanGuard) 판정은 호출부 책임이다 — 사진은 계속 쌓이는 자원이라
 * 한도를 걸지만, 음성 클립은 문구당 최대 1개(재녹음은 교체)라 여기서는 순수하게
 * 서명만 만들고 한도는 신경 쓰지 않는다.
 */
public final class CloudinarySigner {

    private CloudinarySigner() {
    }

    public static UploadSignatureResponse sign(CloudinaryProperties properties) {
        return sign(properties, properties.getFolder());
    }

    /**
     * 기본 폴더가 아닌 곳에 올리는 서명 — 우리 이모지 원본처럼 <b>서버가 나중에 지울</b> 사진은
     * 전용 하위 폴더에 받아야 "이 폴더의 것만 지운다"는 경계를 그을 수 있다.
     */
    public static UploadSignatureResponse sign(CloudinaryProperties properties, String folder) {
        long timestamp = Instant.now().getEpochSecond();
        // Cloudinary 서명 규칙: 파라미터를 키 알파벳순으로 '&' 연결 후 api_secret 을 붙여 SHA-1
        String toSign = "folder=" + folder + "&timestamp=" + timestamp + properties.getApiSecret();
        return new UploadSignatureResponse(
                properties.getCloudName(), properties.getApiKey(), timestamp, folder, sha1Hex(toSign));
    }

    /** 서명 규칙은 업로드·삭제·서버 업로드가 전부 같다 — 같은 패키지의 다른 클라이언트도 이걸 쓴다. */
    static String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }
    }
}
