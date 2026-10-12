package com.fitto.common.upload;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

/**
 * R2 업로드 발급·삭제 (2026-10-12). 업로드는 Cloudinary 때와 같이 <b>앱이 직접</b> 보낸다 — 서버는 서명된 PUT 주소만 준다.
 * 사진이 서버를 지나가지 않는 구조(docs/IMAGE_UPLOAD.md "하지 말 것")를 그대로 지킨다.
 */
@Component
public class R2Storage {

    private static final Logger log = LoggerFactory.getLogger(R2Storage.class);

    /** 서명된 업로드 주소의 수명 — 고른 사진을 올리기까지면 충분하다 */
    static final long UPLOAD_EXPIRES_SECONDS = 10 * 60;
    private static final String REGION = "auto";

    /** 받는 이미지 형식 → 확장자. 여기 없는 형식은 서명하지 않는다(HTML 등이 우리 도메인에서 서빙되지 않게) */
    private static final Map<String, String> IMAGE_TYPES = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp",
            "image/heic", "heic",
            "image/gif", "gif");

    private static final SecureRandom RANDOM = new SecureRandom();

    private final R2Properties properties;
    private final RestClient restClient;

    public R2Storage(R2Properties properties) {
        this.properties = properties;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(10_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** 앱이 올릴 곳 — 이 주소로 같은 Content-Type 을 붙여 PUT 하면 {@code publicUrl} 로 보인다 */
    public record UploadTarget(String uploadUrl, String publicUrl, String contentType) {
    }

    public static boolean isSupportedImageType(String contentType) {
        return contentType != null && IMAGE_TYPES.containsKey(contentType);
    }

    public UploadTarget presignUpload(String folder, String contentType, Instant now) {
        String ext = IMAGE_TYPES.get(contentType);
        if (ext == null) {
            throw new IllegalArgumentException("지원하지 않는 이미지 형식: " + contentType);
        }
        byte[] random = new byte[12];
        RANDOM.nextBytes(random);
        String key = folder + "/" + now.getEpochSecond() + "-" + HexFormat.of().formatHex(random) + "." + ext;
        String uploadUrl = R2Signer.presign("PUT", objectUrl(key), Map.of("content-type", contentType),
                properties.getAccessKeyId(), properties.getSecretAccessKey(), REGION, now, UPLOAD_EXPIRES_SECONDS);
        return new UploadTarget(uploadUrl, properties.getPublicBaseUrl() + "/" + key, contentType);
    }

    /**
     * 공개 주소의 파일을 지운다. 성공(없던 파일 포함) 여부 — 예외는 밖으로 던지지 않는다.
     * 우리 파일인지 판정은 호출부(삭제기)가 이미 했다.
     */
    public boolean delete(String publicUrl) {
        Optional<String> key = R2Urls.keyOf(publicUrl, properties);
        if (key.isEmpty() || !properties.isConfigured()) {
            return false;
        }
        String url = R2Signer.presign("DELETE", objectUrl(key.get()), Map.of(),
                properties.getAccessKeyId(), properties.getSecretAccessKey(), REGION, Instant.now(), 60);
        try {
            restClient.delete().uri(URI.create(url)).retrieve().toBodilessEntity();
            return true;
        } catch (HttpClientErrorException.NotFound e) {
            return true;
        } catch (Exception e) {
            log.error("R2 파일 삭제 실패 — 수동 정리 필요: {} ({})", key.get(), e.getMessage());
            return false;
        }
    }

    private String objectUrl(String key) {
        return properties.endpoint() + "/" + R2Signer.encodePath(properties.getBucket()) + "/" + R2Signer.encodePath(key);
    }
}
