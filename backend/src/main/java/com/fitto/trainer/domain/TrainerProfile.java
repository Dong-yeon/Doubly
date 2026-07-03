package com.fitto.trainer.domain;

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
 * 트레이너 프로필 — 설계서 5.4 trainer_profiles.
 */
@Entity
@Table(name = "trainer_profiles")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TrainerProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false, unique = true)
    private Long userId;

    @Column(length = 100)
    private String specialty;

    @Column(columnDefinition = "text")
    private String introduction;

    @Column(columnDefinition = "text")
    private String career;

    @Column(length = 500)
    private String certificate;

    /** 회원 정원 (기본 10명) */
    @Column(name = "max_members", nullable = false)
    private int maxMembers = 10;

    /** 신규 회원 수락 여부 */
    @Column(name = "is_accepting", nullable = false)
    private boolean accepting = true;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private TrainerProfile(Long userId, String specialty, String introduction,
                           String career, String certificate, Integer maxMembers) {
        this.userId = userId;
        this.specialty = specialty;
        this.introduction = introduction;
        this.career = career;
        this.certificate = certificate;
        this.maxMembers = maxMembers != null ? maxMembers : 10;
        this.accepting = true;
    }

    /** 부분 수정 — null 이 아닌 값만 반영 */
    public void update(String specialty, String introduction, String career,
                       String certificate, Integer maxMembers, Boolean accepting) {
        if (specialty != null) this.specialty = specialty;
        if (introduction != null) this.introduction = introduction;
        if (career != null) this.career = career;
        if (certificate != null) this.certificate = certificate;
        if (maxMembers != null) this.maxMembers = maxMembers;
        if (accepting != null) this.accepting = accepting;
    }
}
