package com.fitto.workout.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 맞춤 프로그램(짐워크 스타일) — 요일별 Day 루틴({@link WorkoutRoutine}) 여러 개를 하나로 묶는다.
 *
 * <p>이전엔 "프로그램명 - Day1/Day2/…" 처럼 제목 문자열에만 묶음이 남고, 저장이 끝나면
 * 완전히 독립된 루틴 N개로 흩어져 있었다. 그 결과 "내 루틴" 목록에 Day 가 전부 평면
 * 나열돼 화면이 지저분해지고, 프로그램 단위 진행 정보(몇 주짜리인지)도 저장할 곳이 없었다.
 *
 * <p>Day 루틴 자체는(반복 요일에 매주 그대로 실행되는 것) 지금까지와 동일하다 — {@code totalWeeks}
 * 는 주차별로 내용을 바꾸는 게 아니라, "8주 프로그램"이라는 기간을 기록해 진행률
 * ("3주차 / 8주차")을 계산하는 표시용 값이다.
 */
@Entity
@Table(name = "workout_programs")
@Getter
@EntityListeners(AuditingEntityListener.class)
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class WorkoutProgram {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 80)
    private String title;

    @Column(name = "total_weeks", nullable = false)
    private int totalWeeks;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /** 프로그램이 지워지면 그 소속 Day 루틴도 같이 지운다 — 독립적으로 남겨둘 이유가 없다. */
    @OneToMany(mappedBy = "program", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("dayNo asc")
    private List<WorkoutRoutine> routines = new ArrayList<>();

    @Builder
    private WorkoutProgram(Long userId, String title, int totalWeeks) {
        this.userId = userId;
        this.title = title;
        this.totalWeeks = totalWeeks;
    }

    public void addRoutine(WorkoutRoutine routine, int dayNo) {
        routines.add(routine);
        routine.assignToProgram(this, dayNo);
    }
}
