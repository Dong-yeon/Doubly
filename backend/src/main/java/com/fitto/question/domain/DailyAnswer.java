package com.fitto.question.domain;

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

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 데일리 질문 답변 — 커플 Q&A. (couple, date, user) 유니크.
 */
@Entity
@Table(name = "daily_answers")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DailyAnswer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "couple_id", nullable = false)
    private Long coupleId;

    @Column(name = "question_date", nullable = false)
    private LocalDate questionDate;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "question_text", nullable = false, length = 200)
    private String questionText;

    @Column(nullable = false, columnDefinition = "text")
    private String answer;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private DailyAnswer(Long coupleId, LocalDate questionDate, Long userId, String questionText, String answer) {
        this.coupleId = coupleId;
        this.questionDate = questionDate;
        this.userId = userId;
        this.questionText = questionText;
        this.answer = answer;
    }

    public void updateAnswer(String answer) {
        this.answer = answer;
    }
}
