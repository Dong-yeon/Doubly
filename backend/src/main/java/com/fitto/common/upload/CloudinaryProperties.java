package com.fitto.common.upload;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Cloudinary 서명 업로드 설정 바인딩 — application.yml 의 fitto.cloudinary.*
 * 미설정 시 프론트는 기존 unsigned preset 업로드로 폴백한다.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.cloudinary")
public class CloudinaryProperties {

    private String cloudName = "";

    private String apiKey = "";

    /** 서명 생성용 시크릿 — 절대 클라이언트로 내려보내지 않는다. */
    private String apiSecret = "";

    /** 업로드 폴더 (선택) — 서명에 포함되어 클라이언트가 임의 변경 불가 */
    private String folder = "fitto";

    public boolean isConfigured() {
        return !cloudName.isBlank() && !apiKey.isBlank() && !apiSecret.isBlank();
    }
}
