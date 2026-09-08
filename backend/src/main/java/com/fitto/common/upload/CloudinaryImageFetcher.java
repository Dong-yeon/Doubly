package com.fitto.common.upload;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.io.InputStream;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Set;

/**
 * 우리가 Cloudinary 에 올린 사진을 서버가 <b>AI 입력용으로</b> 내려받는다 — 음식 사진 분석과
 * 우리 이모지가 같은 코드를 쓴다(원래 {@code FoodAnalysisService} 안에 있던 것을 그대로 옮겼다).
 *
 * <p>지키는 것 세 가지:
 * <ul>
 *   <li><b>SSRF 방지</b> — cloudinary.com 만 허용하고 리다이렉트를 따르지 않는다. 화이트리스트를 3xx 로
 *       우회하는 경로를 막기 위해서다.</li>
 *   <li><b>크기 상한</b> — 스트리밍으로 상한+1 바이트까지만 읽는다. 초대형 응답의 메모리 스파이크 방지.</li>
 *   <li><b>실제 포맷 판별</b> — Gemini 는 선언된 mimeType 과 실제 바이트가 다르면 거부하므로 CDN 헤더를
 *       믿지 않고 매직 바이트로 판별한다.</li>
 * </ul>
 *
 * <p>스프링 빈으로도 쓰고 {@code new} 로도 쓴다(설정 의존이 없다) — {@code FoodAnalysisService} 는
 * 기존 생성자 시그니처를 유지하려고 직접 만든다.
 */
@Component
public class CloudinaryImageFetcher {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryImageFetcher.class);

    /** Cloudinary 업로드 결과만 허용 — 임의 URL 페치(SSRF) 방지 */
    private static final String ALLOWED_HOST_SUFFIX = "cloudinary.com";

    private static final int MAX_IMAGE_BYTES = 10 * 1024 * 1024;

    /**
     * Cloudinary 변환 파라미터 — AI 입력에 1024px 이상은 의미가 없으므로 다운로드 자체를 그 크기로
     * 줄여 받는다({@code c_limit} 이라 더 작은 원본을 <b>키우진</b> 않는다). {@code q_auto} 는 화질 저하
     * 없이 인코딩만 최적화한다. <b>포맷은 바꾸지 않는다</b>(f_auto 미사용) — Gemini 미지원 포맷(AVIF 등)으로
     * 나갈 위험을 피하고, 매직바이트 판별이 실제 업로드 포맷을 그대로 신뢰할 수 있게 한다.
     */
    private static final String CLOUDINARY_TRANSFORM = "w_1024,c_limit,q_auto";

    /** Gemini 가 지원하는 이미지 MIME 화이트리스트 */
    private static final Set<String> SUPPORTED_MIME = Set.of(
            MediaType.IMAGE_JPEG_VALUE, MediaType.IMAGE_PNG_VALUE, MediaType.IMAGE_GIF_VALUE,
            "image/webp", "image/heic", "image/heif");

    private final RestClient restClient;

    public CloudinaryImageFetcher() {
        // 리다이렉트 미추종 — 화이트리스트(cloudinary) 검증을 3xx 로 우회하는 SSRF 방지
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(30));
        this.restClient = RestClient.builder().requestFactory(factory).build();
    }

    /** 내려받은 이미지 — mimeType 은 매직 바이트로 판별한 실제 포맷 */
    public record Image(byte[] bytes, String mimeType) {
    }

    public Image fetch(String photoUrl) {
        URI uri;
        try {
            uri = URI.create(photoUrl);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null
                || !(host.equals(ALLOWED_HOST_SUFFIX) || host.endsWith("." + ALLOWED_HOST_SUFFIX))) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
        // 호스트 검증을 통과한 뒤에만 변환을 건다 — 임의 URL 에 변환 세그먼트를 끼워 넣어봐야
        // 애초에 cloudinary.com 이 아니면 위에서 이미 막힌 뒤다.
        uri = withTransform(uri);

        try {
            // 리다이렉트(3xx)는 팩토리에서 미추종이므로 2xx 가 아니면 전부 거부된다.
            // 실패 원인은 코드별로 분리해 어떤 문제인지 바로 보이게 한다.
            return restClient.get().uri(uri).exchange((request, response) -> {
                if (!response.getStatusCode().is2xxSuccessful()) {
                    throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
                }
                long declared = response.getHeaders().getContentLength();
                if (declared > MAX_IMAGE_BYTES) {
                    throw new BusinessException(ErrorCode.PHOTO_TOO_LARGE);
                }
                try (InputStream in = response.getBody()) {
                    byte[] body = in.readNBytes(MAX_IMAGE_BYTES + 1);
                    if (body.length == 0) {
                        throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
                    }
                    if (body.length > MAX_IMAGE_BYTES) {
                        throw new BusinessException(ErrorCode.PHOTO_TOO_LARGE);
                    }
                    String mimeType = resolveMimeType(body, response.getHeaders().getContentType());
                    return new Image(body, mimeType);
                }
            });
        } catch (RestClientResponseException | ResourceAccessException e) {
            log.warn("사진 다운로드 실패: {}", e.getMessage());
            throw new BusinessException(ErrorCode.PHOTO_DOWNLOAD_FAILED);
        }
    }

    /**
     * Cloudinary URL 경로의 {@code /upload/} 바로 뒤에 변환 세그먼트를 끼워 넣는다.
     * <pre>
     *   .../image/upload/v169.../folder/abc.jpg
     *   → .../image/upload/w_1024,c_limit,q_auto/v169.../folder/abc.jpg
     * </pre>
     * 우리 업로드 흐름(imageUpload.ts)이 만드는 URL 은 항상 이 모양이라 안전하게 걸린다.
     * 혹시 모양이 다르면({@code /upload/} 이 없으면) <b>원본 URL 그대로</b> 돌려준다 — 변환은
     * 최적화지 기능이 아니라서, 여기서 실패해도 다운로드 자체는 막지 않는다.
     */
    public URI withTransform(URI uri) {
        String path = uri.getRawPath();
        int idx = path.indexOf("/upload/");
        if (idx < 0) {
            return uri;
        }
        int insertAt = idx + "/upload/".length();
        String newPath = path.substring(0, insertAt) + CLOUDINARY_TRANSFORM + "/" + path.substring(insertAt);
        try {
            return new URI(uri.getScheme(), uri.getAuthority(), newPath, uri.getQuery(), uri.getFragment());
        } catch (URISyntaxException e) {
            log.warn("Cloudinary 변환 URL 조립 실패 — 원본으로 다운로드합니다: {}", e.getMessage());
            return uri;
        }
    }

    /**
     * 실제 이미지 포맷을 판별한다. 파일 시그니처(매직 바이트)를 우선 쓰고, 그걸로 판별 못 하면
     * 헤더가 지원 포맷을 명시할 때만 신뢰한다. 지원 포맷을 특정할 수 없으면 명확히 거부한다.
     */
    private String resolveMimeType(byte[] body, MediaType headerContentType) {
        String sniffed = sniffImageMimeType(body);
        if (sniffed != null) {
            return sniffed;
        }
        if (headerContentType != null) {
            String type = headerContentType.getType() + "/" + headerContentType.getSubtype();
            if (SUPPORTED_MIME.contains(type)) {
                return type;
            }
        }
        log.warn("지원하지 않는 이미지 포맷. header={}", headerContentType);
        throw new BusinessException(ErrorCode.PHOTO_UNSUPPORTED_FORMAT);
    }

    /** 파일 시그니처로 이미지 포맷 판별 — Gemini 가 지원하는 포맷(PNG/JPEG/WEBP/HEIC/HEIF/GIF)만 확인 */
    private String sniffImageMimeType(byte[] b) {
        if (startsWith(b, 0xFF, 0xD8, 0xFF)) return MediaType.IMAGE_JPEG_VALUE;
        if (startsWith(b, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return MediaType.IMAGE_PNG_VALUE;
        if (startsWith(b, 0x47, 0x49, 0x46, 0x38)) return MediaType.IMAGE_GIF_VALUE;
        if (b.length >= 12 && startsWith(b, 0x52, 0x49, 0x46, 0x46) && matches(b, 8, 0x57, 0x45, 0x42, 0x50)) {
            return "image/webp";
        }
        if (b.length >= 12 && matches(b, 4, 0x66, 0x74, 0x79, 0x70)) { // "ftyp" box (HEIC/HEIF container)
            String brand = new String(b, 8, 4, StandardCharsets.US_ASCII);
            if (brand.startsWith("heic") || brand.startsWith("heix") || brand.startsWith("hevc")
                    || brand.startsWith("hevx") || brand.startsWith("mif1") || brand.startsWith("msf1")) {
                return brand.startsWith("mif1") || brand.startsWith("msf1") ? "image/heif" : "image/heic";
            }
        }
        return null;
    }

    private boolean startsWith(byte[] b, int... signature) {
        return matches(b, 0, signature);
    }

    private boolean matches(byte[] b, int offset, int... signature) {
        if (b.length < offset + signature.length) return false;
        for (int i = 0; i < signature.length; i++) {
            if ((b[offset + i] & 0xFF) != signature[i]) return false;
        }
        return true;
    }
}
