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

    /**
     * URL 의 리소스 종류 — {@code .../video/upload/...} 이면 video.
     * 오디오(음성 응원·음성 메시지)는 앱이 {@code /video/upload} 로 올린다(Cloudinary 는 오디오를
     * video 로 다룬다). destroy 도 같은 종류의 엔드포인트로 보내야 지워진다 — image/destroy 로
     * 보내면 "not found" 로 끝나고 파일은 그대로 남는다.
     */
    private static final Pattern RESOURCE_TYPE = Pattern.compile("/(image|video)/upload/");

    private final CloudinaryProperties properties;
    private final StoredMediaReferences references;
    private final RestClient restClient;

    public CloudinaryImageDeleter(CloudinaryProperties properties, StoredMediaReferences references) {
        this.properties = properties;
        this.references = references;
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

    /**
     * 여러 이미지 삭제 — 하나가 실패해도 나머지는 계속 시도한다.
     *
     * <p><b>아직 다른 행이 쓰는 파일은 남긴다</b>({@link #deletable}). 모든 삭제 경로(식사·피드·운동 삭제,
     * 지난 기록 삭제, 탈퇴)가 여기를 지나므로 호출부는 "내가 지운 행의 URL"만 넘기면 된다.
     */
    public void deleteAll(Collection<String> requestedUrls) {
        if (requestedUrls.isEmpty()) {
            return;
        }
        List<String> imageUrls = deletable(requestedUrls);
        if (imageUrls.size() < requestedUrls.size()) {
            log.info("다른 기록이 함께 쓰는 파일 {}건은 남깁니다", requestedUrls.size() - imageUrls.size());
        }
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

    /**
     * 지워도 되는 URL — 넘겨받은 것 중 어떤 행도 더 이상 가리키지 않는 것만.
     *
     * <p>커밋 이후({@link #deleteAllAfterCommit})에 부르므로 방금 지운 행은 이미 빠져 있다. 예: 식사를
     * 지워도 채팅에 공유한 MEAL_CARD 가 같은 URL 을 들고 있으면 파일은 남는다.
     * 조회가 실패하면 <b>지우지 않는 쪽</b>으로 기운다 — 남은 파일은 나중에 치울 수 있지만,
     * 쓰이던 파일을 지우면 되돌릴 수 없다.
     */
    public List<String> deletable(Collection<String> imageUrls) {
        List<String> distinct = imageUrls.stream().distinct().toList();
        try {
            var inUse = references.stillReferenced(distinct);
            return distinct.stream().filter(u -> !inUse.contains(u)).toList();
        } catch (Exception e) {
            log.error("파일 참조 확인 실패 — 이번에는 {}건을 지우지 않습니다 ({})", distinct.size(), e.getMessage());
            return List.of();
        }
    }

    /** 단건 삭제. 성공 여부 반환 — 예외는 밖으로 던지지 않는다. */
    public boolean delete(String imageUrl) {
        /*
         * 우리 클라우드·루트 폴더의 원본 URL 만 지운다 — 변형 URL(다른 cloud 이름, 변환 세그먼트, "..")로
         * 남의 원본을 지우는 경로를 막는다(CloudinaryUrls 주석). 기록마다 저장 시점 검증이 제각각이라
         * (운동·식단·방문 사진은 URL 을 따로 보지 않는다) 모든 삭제가 지나는 이 자리에서 한 번에 막는다.
         * 걸러진 파일은 남을 뿐이다 — 남은 파일은 치울 수 있지만 잘못 지운 파일은 되돌릴 수 없다.
         */
        if (!CloudinaryUrls.isOwnOriginal(imageUrl, properties)) {
            log.warn("우리가 올린 원본 URL 이 아니어서 지우지 않습니다: {}", imageUrl);
            return false;
        }
        String publicId = extractPublicId(imageUrl);
        if (publicId == null) {
            log.warn("Cloudinary URL 형식이 아니어서 건너뜁니다: {}", imageUrl);
            return false;
        }
        String resourceType = extractResourceType(imageUrl);
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
                    .uri("https://api.cloudinary.com/v1_1/{cloud}/{type}/destroy",
                            properties.getCloudName(), resourceType)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (Exception e) {
            log.error("이미지 삭제 실패 — 수동 정리 필요: {}/{} ({})", resourceType, publicId, e.getMessage());
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

    /** destroy 엔드포인트의 리소스 종류. 경로에 종류가 없으면 Cloudinary 기본값인 image. */
    public String extractResourceType(String url) {
        Matcher matcher = RESOURCE_TYPE.matcher(url);
        return matcher.find() ? matcher.group(1) : "image";
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
