package com.fitto.workout.domain;

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
 * 종목 카탈로그 — 자극 부위(muscleGroup)/기구(equipment) 태그의 출처.
 * 대체 종목 추천, 자극 부위 시각화, AI 추천 고도화가 모두 이 태그에 의존한다.
 * {@code createdBy} 가 null 이면 시스템 기본 제공 종목, 값이 있으면 사용자가 추가한 커스텀 종목.
 */
@Entity
@Table(name = "exercise_catalog")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ExerciseCatalog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100, unique = true)
    private String name;

    @Column(nullable = false, length = 20)
    private String category;

    @Column(name = "muscle_group", nullable = false, length = 20)
    private String muscleGroup;

    @Column(length = 30)
    private String equipment;

    /**
     * "이게 무슨 동작인지" 한 줄 설명 — 세션 카드에서 TIP 위에 노출한다(nullable).
     * {@link #tip} 과 대상 독자가 다르다: tip 은 이미 그 운동을 아는 사람에게 주는 <b>자세 교정 큐</b>이고,
     * 이 필드는 그 앞 단계인 <b>동작 자체의 설명</b>이다(예: 풀업 = "철봉에 매달려 몸을 끌어올린다").
     */
    @Column(length = 300)
    private String description;

    /** 자세 큐/안내 문구 — 운동 세션 화면의 TIP 카드로 노출한다. 커스텀 종목은 없을 수 있다(nullable). */
    @Column(length = 200)
    private String tip;

    /** 이 종목이 뭔지 한눈에 보여주는 이모지 — 세션 카드에서 종목명 옆에 크게 노출한다(nullable). */
    @Column(length = 8)
    private String emoji;

    /** 언제 숨을 내쉬고 마시는지 — TIP 카드에 자세 큐와 함께 항상 붙는 호흡 타이밍 문구(nullable). */
    @Column(name = "breathing_cue", length = 100)
    private String breathingCue;

    /**
     * 검색용 별칭 — 쉼표 구분(예: 풀업 = "턱걸이, pull up").
     *
     * <p>이름에 부분 문자열로 들어 있는 말("벤치" → 벤치프레스)은 별칭이 없어도 찾히지만,
     * "턱걸이 → 풀업"처럼 글자가 겹치지 않는 말은 별칭이 없으면 영영 못 찾는다.
     * 별도 테이블을 만들 만큼 쓰임이 많지 않아 한 칸에 담는다.
     */
    @Column(length = 200)
    private String aliases;

    @Column(name = "created_by")
    private Long createdBy;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Builder
    private ExerciseCatalog(String name, String category, String muscleGroup, String equipment, String description,
                             String tip, String emoji, String breathingCue, Long createdBy) {
        this.name = name;
        this.category = category;
        this.muscleGroup = muscleGroup;
        this.equipment = equipment;
        this.description = description;
        this.tip = tip;
        this.emoji = emoji;
        this.breathingCue = breathingCue;
        this.createdBy = createdBy;
    }
}
