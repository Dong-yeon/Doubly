package com.fitto.common.upload;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;

/**
 * 이미지 업로드 서명 발급 — Cloudinary signed upload.
 * unsigned preset 은 클라이언트에 노출되어 악용 시 스토리지가 오염될 수 있어,
 * 로그인 사용자에게만 단기 서명을 발급한다 (Cloudinary 서명은 발급 후 1시간 유효).
 */
@RestController
@RequestMapping("/api/v1/uploads")
public class UploadController {

    private final CloudinaryProperties properties;

    public UploadController(CloudinaryProperties properties) {
        this.properties = properties;
    }

    @PostMapping("/signature")
    public ApiResponse<UploadSignatureResponse> signature(@AuthenticationPrincipal AuthUser user) {
        if (!properties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        long timestamp = Instant.now().getEpochSecond();
        // Cloudinary 서명 규칙: 파라미터를 키 알파벳순으로 '&' 연결 후 api_secret 을 붙여 SHA-1
        String toSign = "folder=" + properties.getFolder() + "&timestamp=" + timestamp
                + properties.getApiSecret();
        return ApiResponse.success(new UploadSignatureResponse(
                properties.getCloudName(), properties.getApiKey(), timestamp,
                properties.getFolder(), sha1Hex(toSign)));
    }

    private String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR);
        }
    }
}
