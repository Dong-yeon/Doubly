package com.fitto.coupleemoji.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
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
 * 우리 이모지 세트 한 벌 — 한 번의 생성 요청(V138).
 *
 * <p>장({@link CoupleEmoji})은 이미 {@code batchId} 로 묶여 있었지만 <b>세트에 붙는 값</b>을 둘 곳이 없었다.
 * 지금 그런 값은 둘이다 — 무엇으로 만들었나({@code chargeSource}), 다시 그리기가 몇 번 남았나.
 * 다시 그리기는 그 세트 안에서만 쓰는 잔량이라 사람(크레딧)이 아니라 여기에 붙는다
 * (docs/EMOJI_12_REGEN_2026-10-13.md §7 안 A).
 *
 * <p><b>잔량은 엔티티로 고치지 않는다.</b> 읽고 더해서 쓰면 동시 요청에 한 번이 두 번 쓰인다 — 차감·되돌림은
 * {@code CoupleEmojiSetRepository} 의 조건부 UPDATE 한 줄로만 한다.
 */
@Entity
@Table(name = "couple_emoji_sets")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoupleEmojiSet {

    /** 새로 만드는 세트가 받는 다시 그리기 횟수 — 상품 정의("12장 + 다시 그리기 3번")의 뒷부분. */
    public static final int REGEN_PER_SET = 3;

    /** 예전 규칙(한 번에 6장)으로 만든 세트 — V138 백필. 다시 그리기 권리가 없다. */
    public static final String LEGACY = "LEGACY";

    @Id
    @Column(name = "batch_id", length = 36)
    private String batchId;

    @Column(name = "relation_id", nullable = false)
    private Long relationId;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    /** {@code PlanGuard.Charge} 이름 또는 {@link #LEGACY} — 환불·지표에서 "산 세트였나"를 가른다. */
    @Column(name = "charge_source", nullable = false, length = 20)
    private String chargeSource;

    @Column(name = "regen_total", nullable = false)
    private int regenTotal;

    @Column(name = "regen_used", nullable = false)
    private int regenUsed;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private CoupleEmojiSet(String batchId, Long relationId, Long createdBy, String chargeSource, int regenTotal) {
        this.batchId = batchId;
        this.relationId = relationId;
        this.createdBy = createdBy;
        this.chargeSource = chargeSource;
        this.regenTotal = regenTotal;
        this.regenUsed = 0;
    }

    public int regenRemaining() {
        return Math.max(0, regenTotal - regenUsed);
    }
}
