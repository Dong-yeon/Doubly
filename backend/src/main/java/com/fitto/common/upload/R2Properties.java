package com.fitto.common.upload;

import lombok.Getter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cloudflare R2 설정 — application.yml 의 fitto.r2.* (2026-10-12, docs/r2-migration-plan_2026-10-12.md).
 *
 * <p>사진 보기 전송량이 Cloudinary 무료 한도를 가장 빨리 깎아(docs/photo-storage-cost_2026-10-12.md) 새 업로드를
 * 전송 무료인 R2 로 옮긴다. 옛 Cloudinary 주소는 그대로 두고 둘 다 "우리 파일"로 인정한다.
 *
 * <p>값 앞뒤 공백은 지운다 — Railway 변수에 붙여 넣다 줄바꿈이 따라 들어간 적이 있다(키 길이 33/65).
 */
@Getter
@Component
@ConfigurationProperties(prefix = "fitto.r2")
public class R2Properties {

    private String accountId = "";
    private String accessKeyId = "";
    /** 서명용 — 절대 클라이언트로 내려보내지 않는다 */
    private String secretAccessKey = "";
    private String bucket = "";
    /** 사진을 보여 주는 공개 주소 — R2 커스텀 도메인. 끝에 / 없이 */
    private String publicBaseUrl = "https://media.dubly.co.kr";
    /** 새 업로드를 R2 로 보낼지 — 꺼 두면 R2 를 알아도 Cloudinary 서명만 준다(전환·되돌리기 스위치) */
    private boolean uploadsEnabled = false;

    public void setAccountId(String v) { this.accountId = trim(v); }
    public void setAccessKeyId(String v) { this.accessKeyId = trim(v); }
    public void setSecretAccessKey(String v) { this.secretAccessKey = trim(v); }
    public void setBucket(String v) { this.bucket = trim(v); }
    public void setPublicBaseUrl(String v) { this.publicBaseUrl = trim(v).replaceAll("/+$", ""); }
    public void setUploadsEnabled(boolean v) { this.uploadsEnabled = v; }

    /** 키·버킷·공개 주소가 다 있으면 지우기·판정을 할 수 있다(업로드 발급 여부는 {@link #isUploadReady}) */
    public boolean isConfigured() {
        return !accountId.isBlank() && !accessKeyId.isBlank() && !secretAccessKey.isBlank()
                && !bucket.isBlank() && !publicBaseUrl.isBlank();
    }

    public boolean isUploadReady() {
        return uploadsEnabled && isConfigured();
    }

    /** S3 호환 API 주소 — https://{계정}.r2.cloudflarestorage.com (경로형으로 버킷을 붙인다) */
    public String endpoint() {
        return "https://" + accountId + ".r2.cloudflarestorage.com";
    }

    private static String trim(String v) {
        return v == null ? "" : v.trim();
    }
}
