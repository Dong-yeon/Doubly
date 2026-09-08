package com.fitto.common.upload;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.time.Instant;

/**
 * 서버가 직접 Cloudinary 에 이미지를 올린다 — <b>우리 이모지(AI 생성물) 전용</b>.
 *
 * <p>이 저장소의 원칙은 "이미지는 서버를 지나가지 않는다"(docs/IMAGE_UPLOAD.md: 클라가 직접 올리고
 * 서버는 서명만 준다)이고, 이 클래스는 그 원칙의 <b>의도적 예외</b>다. AI 가 그린 이미지는 Gemini 에서
 * 서버로 도착하므로 어차피 서버를 지난다. base64 로 앱에 돌려주고 앱이 올리게 하면 작업 결과
 * (Redis 문자열)가 장당 수백 KB 로 부풀고, 업로드 도중 앱이 죽으면 돈만 나가고 세트가 없다.
 * 원칙이 막으려던 건 <b>모든 사용자 사진마다 Railway CPU 를 쓰는 리사이즈</b>였다 — 여기는 PRO 게이팅된
 * 드문 작업이고 리사이즈가 없다(docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-3).
 * 다른 기능이 이 클래스를 가져다 쓰기 전에 그 문서의 표를 다시 읽을 것.
 *
 * <p>서명 규칙은 {@link CloudinarySigner}·{@link CloudinaryImageDeleter} 와 같다(파라미터 알파벳순 +
 * api_secret, SHA-1). 서명에 넣은 파라미터만 서명에 들어가므로 여기서는 {@code folder}·{@code timestamp}
 * 두 개다.
 */
@Component
public class CloudinaryImageUploader {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryImageUploader.class);

    private final CloudinaryProperties properties;
    private final RestClient restClient;

    public CloudinaryImageUploader(CloudinaryProperties properties) {
        this.properties = properties;
        // 업로드는 장당 수백 KB — 연결 5초, 전송 30초면 넉넉하고, 그보다 오래 걸리면 실패로 보는 게 맞다.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(30_000);
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /**
     * 이미지 한 장을 올리고 {@code secure_url} 을 돌려준다.
     *
     * @param subfolder 설정된 기본 폴더 아래의 하위 폴더(예: {@code couple-emoji}) — 나중에 스토리지를
     *                  옮길 때 이 폴더만 따로 옮길 수 있게 기능별로 나눈다
     * @param mimeType  Gemini 응답의 mimeType 그대로 — 모델마다 PNG/JPEG 가 다르므로 확장자를 박지 않는다
     */
    public String upload(byte[] bytes, String mimeType, String subfolder) {
        if (!properties.isConfigured()) {
            // 서명 업로드는 시크릿이 있어야 한다 — unsigned preset 폴백은 서버에서 쓰지 않는다.
            log.warn("Cloudinary 미설정 — 서버 업로드 불가");
            throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }
        String folder = properties.getFolder() + "/" + subfolder;
        long timestamp = Instant.now().getEpochSecond();
        String signature = CloudinarySigner.sha1Hex(
                "folder=" + folder + "&timestamp=" + timestamp + properties.getApiSecret());

        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return "image." + extensionOf(mimeType);
            }
        });
        form.add("api_key", properties.getApiKey());
        form.add("timestamp", String.valueOf(timestamp));
        form.add("folder", folder);
        form.add("signature", signature);

        try {
            JsonNode response = restClient.post()
                    .uri("https://api.cloudinary.com/v1_1/{cloud}/image/upload", properties.getCloudName())
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);
            String url = response == null ? null : response.path("secure_url").asText(null);
            if (url == null || url.isBlank()) {
                log.warn("Cloudinary 업로드 응답에 secure_url 없음: {}", response);
                throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED);
            }
            return url;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Cloudinary 서버 업로드 실패({}): {}", folder, e.getMessage());
            throw new BusinessException(ErrorCode.IMAGE_UPLOAD_FAILED);
        }
    }

    private static String extensionOf(String mimeType) {
        if (mimeType == null) return "png";
        return switch (mimeType) {
            case "image/jpeg", "image/jpg" -> "jpg";
            case "image/webp" -> "webp";
            case "image/gif" -> "gif";
            default -> "png";
        };
    }
}
