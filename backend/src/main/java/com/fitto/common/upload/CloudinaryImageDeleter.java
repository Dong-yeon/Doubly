package com.fitto.common.upload;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Collection;
import java.util.HexFormat;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cloudinary 이미지 삭제 — 기록 완전 삭제(AUTH-10)에서 사용.
 *
 * <p>DB 행만 지우면 이미지는 URL 로 영구히 접근 가능하다. "완전 삭제"라고 부르려면
 * 원본 파일까지 지워야 한다.
 *
 * <p><b>실패는 삼킨다</b>: 이미지 삭제에 실패해도 DB 삭제를 되돌리지 않는다.
 * 되돌리면 사용자는 "삭제했는데 기록이 그대로"인 상태가 되고, 재시도해도 같은 지점에서
 * 막힌다. 실패한 public_id 는 로그로 남겨 수동 정리할 수 있게 한다.
 */
@Component
public class CloudinaryImageDeleter {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryImageDeleter.class);

    /**
     * Cloudinary URL 에서 public_id 추출.
     * 예) https://res.cloudinary.com/demo/image/upload/v1712345678/fitto/abc123.jpg → fitto/abc123
     * 변환 파라미터(w_100,c_fill 등)가 붙는 경우까지 고려해 /upload/ 이후의
     * 버전 세그먼트(v숫자)를 건너뛴 나머지를 public_id 로 본다.
     */
    private static final Pattern PUBLIC_ID = Pattern.compile(
            "/upload/(?:[^/]+/)*?(?:v\\d+/)?(.+?)(?:\\.[a-zA-Z0-9]+)?$");

    private final CloudinaryProperties properties;
    private final RestClient restClient;

    public CloudinaryImageDeleter(CloudinaryProperties properties) {
        this.properties = properties;
        this.restClient = RestClient.builder().build();
    }

    /**
     * 트랜잭션 커밋 이후에 삭제한다.
     *
     * <p>트랜잭션 안에서 지우면 이후 롤백이 나도 파일은 이미 사라진 뒤라 되돌릴 수 없다
     * — DB 에는 기록이 남았는데 이미지만 없는 상태가 된다. 커밋이 확정된 뒤에만 지운다.
     * 진행 중인 트랜잭션이 없으면 즉시 삭제한다.
     */
    public void deleteAllAfterCommit(Collection<String> imageUrls) {
        if (imageUrls.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            deleteAll(imageUrls);
            return;
        }
        List<String> snapshot = List.copyOf(imageUrls);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteAll(snapshot);
            }
        });
    }

    /** 여러 이미지 삭제 — 하나가 실패해도 나머지는 계속 시도한다. */
    public void deleteAll(Collection<String> imageUrls) {
        if (imageUrls.isEmpty()) {
            return;
        }
        if (!properties.isConfigured()) {
            // unsigned 폴백으로 올라간 이미지는 서버가 지울 수 없다 — 운영에서는 설정 필수.
            log.warn("Cloudinary 미설정 — 이미지 {}건을 삭제하지 못했습니다. 수동 정리가 필요합니다.",
                    imageUrls.size());
            return;
        }
        int deleted = 0;
        for (String url : imageUrls) {
            if (delete(url)) {
                deleted++;
            }
        }
        log.info("이미지 삭제 완료: {}/{}건", deleted, imageUrls.size());
    }

    /** 단건 삭제. 성공 여부 반환 — 예외는 밖으로 던지지 않는다. */
    public boolean delete(String imageUrl) {
        String publicId = extractPublicId(imageUrl);
        if (publicId == null) {
            log.warn("Cloudinary URL 형식이 아니어서 건너뜁니다: {}", imageUrl);
            return false;
        }
        try {
            long timestamp = Instant.now().getEpochSecond();
            // 서명 규칙은 업로드와 동일 — 파라미터 알파벳순 '&' 연결 후 api_secret 붙여 SHA-1
            String signature = sha1Hex(
                    "public_id=" + publicId + "&timestamp=" + timestamp + properties.getApiSecret());

            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("public_id", publicId);
            form.add("timestamp", String.valueOf(timestamp));
            form.add("api_key", properties.getApiKey());
            form.add("signature", signature);

            restClient.post()
                    .uri("https://api.cloudinary.com/v1_1/{cloud}/image/destroy",
                            properties.getCloudName())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.error("이미지 삭제 실패 — 수동 정리 필요: publicId={} ({})", publicId, e.getMessage());
            return false;
        }
    }

    /** 패키지 외부 테스트에서도 쓸 수 있도록 공개 — URL 파싱만 검증 가능하게 한다. */
    public String extractPublicId(String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank() || !imageUrl.contains("/upload/")) {
            return null;
        }
        Matcher matcher = PUBLIC_ID.matcher(imageUrl);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String sha1Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-1 사용 불가", e);
        }
    }
}
