package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 카카오 로컬(장소 검색) REST API 설정 바인딩 — application.yml 의 fitto.kakao.*
 *
 * <p>프론트의 지도용 JavaScript 키와는 <b>별개의 키</b>다 — 카카오 개발자 콘솔의 같은 앱에서
 * "REST API 키"를 복사해 쓰면 된다. 비어 있으면 AI 맛집 추천만 비활성 —
 * {@link com.fitto.place.service.KakaoLocalClient} 참고.
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.kakao")
public class KakaoLocalProperties {

    /** 카카오 REST API 키. 비어 있으면 AI 맛집 추천 비활성. */
    private String restApiKey = "";

    public boolean isConfigured() {
        return restApiKey != null && !restApiKey.isBlank();
    }
}
