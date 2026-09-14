package com.fitto.common.ai;

import com.fitto.common.plan.Feature;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * Gemini 호출 한 건의 토큰 사용량(V89) — 응답의 {@code usageMetadata} 를 그대로 적재한다.
 *
 * <p><b>왜 남기나.</b> {@code fitto.ai.gemini.call}(Micrometer)은 호출이 <b>얼마나 걸렸고 성공했는지</b>만
 * 남긴다. 그것만으로는 청구서가 왔을 때 어느 기능이 얼마를 썼는지 역산할 수 없어, 단가·쿼터 논의가
 * 전부 가정 위에서 돈다. 여기에 토큰이 쌓이면 "기능별 원가 비중"과 "유저별 월 원가"가 질의 하나로 나온다.
 *
 * <p><b>성공한 호출만 쌓인다.</b> 실패 응답(4xx·5xx)에는 {@code usageMetadata} 가 없고, 실제로 과금되지도
 * 않는다. 재시도 끝에 성공한 경우는 {@code attempt} 가 1보다 크게 남으므로 재시도율은 여기서 보인다.
 *
 * <p><b>{@code thoughtsTokens} 를 따로 두는 이유</b>는 이게 <b>output 단가로 과금</b>되면서도
 * 사용자에게 보이는 답변에는 한 글자도 안 들어가기 때문이다. 여기가 크면 {@code thinkingBudget} 을
 * 꺼야 한다는 신호고, 그 판단은 값을 봐야만 할 수 있다.
 */
@Entity
@Table(name = "ai_usage_logs")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiUsageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** FK 를 걸지 않는다 — V89 마이그레이션 주석 참고(백그라운드 기록이 탈퇴와 경합한다) */
    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "feature_code", nullable = false, length = 40)
    private String featureCode;

    /** 1차·폴백·이미지 모델이 여기서 갈린다 — 폴백 이름이 잦으면 1차가 죽고 있다는 뜻 */
    @Column(nullable = false, length = 60)
    private String model;

    @Column(name = "prompt_tokens", nullable = false)
    private int promptTokens;

    /** 이미지 생성은 이 값이 곧 장당 원가다(이미지 1장 ≈ 고정 토큰 수) */
    @Column(name = "candidates_tokens", nullable = false)
    private int candidatesTokens;

    @Column(name = "thoughts_tokens", nullable = false)
    private int thoughtsTokens;

    @Column(name = "cached_tokens", nullable = false)
    private int cachedTokens;

    @Column(name = "total_tokens", nullable = false)
    private int totalTokens;

    /** 이번 호출에 <b>보낸</b> 이미지 파트 수 — 입력 토큰이 튀는 경로를 찾는 단서 */
    @Column(name = "image_count", nullable = false)
    private int imageCount;

    /** 1 이 아니면 재시도 끝에 성공한 것. 모델을 바꿔 폴백하면 여기가 1로 다시 시작한다(model 로 구분) */
    @Column(nullable = false)
    private int attempt;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private AiUsageLog(Long userId, Feature feature, String model, int promptTokens,
                       int candidatesTokens, int thoughtsTokens, int cachedTokens,
                       int totalTokens, int imageCount, int attempt) {
        this.userId = userId;
        this.featureCode = feature == null ? "UNKNOWN" : feature.name();
        this.model = model;
        this.promptTokens = promptTokens;
        this.candidatesTokens = candidatesTokens;
        this.thoughtsTokens = thoughtsTokens;
        this.cachedTokens = cachedTokens;
        this.totalTokens = totalTokens;
        this.imageCount = imageCount;
        this.attempt = attempt;
    }
}
