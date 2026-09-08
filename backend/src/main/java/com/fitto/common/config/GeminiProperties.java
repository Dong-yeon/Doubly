package com.fitto.common.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Gemini(음식 사진 AI 분석) 설정 바인딩 — application.yml 의 fitto.gemini.*
 */
@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "fitto.gemini")
public class GeminiProperties {

    /** Google AI Studio API 키. 비어 있으면 분석 기능 비활성. */
    private String apiKey = "";

    /** 사용할 모델. 무료 티어는 flash / flash-lite 계열만 지원. */
    private String model = "gemini-2.5-flash-lite";

    /**
     * 1차 모델이 계속 실패할 때 대신 물어볼 모델. 빈 값이면 폴백하지 않는다.
     *
     * <p>운영 로그상 Gemini 오류는 사실상 전부 503(모델 과부하)이다. 그건 <b>같은 모델로
     * 다시 묻는다고 풀리지 않는다</b> — 다른 모델로 넘어가는 게 유일하게 효과 있는 대응이다.
     * flash-lite 보다 조금 무겁지만 그만큼 덜 붐비는 모델을 기본값으로 둔다.
     */
    private String fallbackModel = "gemini-2.5-flash";

    /**
     * API 베이스 URL. 실사용에서 바꿀 일은 없고, <b>테스트가 실제 구글을 부르지 않게</b>
     * 갈아끼우기 위한 이음매다(호출 실패 시 한도 되돌리기 같은 건 실패를 만들어야 검증된다).
     */
    private String baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

    /**
     * 서비스 전체가 하루에 쓸 수 있는 AI 호출 수 — <b>프로젝트 쿼터를 지키는 진짜 방어선</b>.
     *
     * <p>Google AI Studio 의 일일 한도는 프로젝트 단위다. 그래서 방어도 프로젝트 단위여야
     * 하고, 이 값이 그 역할을 한다. 실제 티어의 RPD 보다 <b>조금 낮게</b> 잡아야
     * "구글이 먼저 막아서 원인 불명으로 전원 실패"하는 대신 우리 쪽에서 알아보는 에러로
     * 떨어진다. 쓰는 모델의 RPD 를 콘솔에서 확인하고 맞출 것.
     */
    private int dailyLimitTotal = 1000;

    /**
     * 사용자 1명당 하루 AI 호출 상한 — <b>남용 방지</b>용이지 쿼터 방어용이 아니다.
     *
     * <p>예전엔 10 이었는데, 이게 프로젝트 쿼터 방어를 겸하고 있었다. 그런데 기능별 한도는
     * PRO 기준 음식사진 30·식단코치 10 처럼 훨씬 큰 값이라, 실제로는 이 10 이 먼저 걸려
     * <b>기능별 한도가 무의미</b>했다. 앱을 한 바퀴 둘러보기만 해도 9회를 쓴다.
     * 쿼터 방어는 위 {@code dailyLimitTotal} 로 분리했으니 여기는 넉넉해도 된다.
     */
    private int dailyLimitPerUser = 50;

    /**
     * 이미지 생성 전용 키 — 텍스트 키와 <b>다른 Google 프로젝트</b>의 키다.
     *
     * <p>이미지 생성 모델은 무료 등급 쿼터가 0이라(실측: {@code limit: 0} 429) 결제가 붙은 프로젝트가
     * 필요하다. 그런데 기존 텍스트 프로젝트에 결제를 붙이면 지금 무료로 도는 텍스트 호출까지 전부
     * 과금된다. 그래서 이미지 전용 프로젝트를 따로 두고 거기에만 결제를 붙인다 —
     * docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §12-2. 비어 있으면 텍스트 키로 폴백하되, 그 키가
     * 무료 등급이면 이미지 호출은 429 로 떨어진다(기능만 실패, 앱은 정상).
     */
    private String imageApiKey = "";

    /**
     * 이미지 생성 모델. 텍스트 모델로는 이미지가 안 나오므로 따로 둔다. 폴백 모델은 없다 —
     * 이미지 모델끼리 바꾸면 세트 안에서 그림체가 갈린다(GeminiClient.generateImageInBackground 주석).
     * 실측 채택은 Nano Banana 2 (§12-3·§12-4) — 단가 확인 후 확정된 값.
     */
    private String imageModel = "gemini-3.1-flash-image";

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank();
    }

    public boolean isImageConfigured() {
        return !imageApiKeyOrFallback().isBlank();
    }

    /** 이미지 키가 비어 있으면 텍스트 키 — 위 {@code imageApiKey} 주석 참고. */
    public String imageApiKeyOrFallback() {
        if (imageApiKey != null && !imageApiKey.isBlank()) {
            return imageApiKey;
        }
        return apiKey == null ? "" : apiKey;
    }
}
