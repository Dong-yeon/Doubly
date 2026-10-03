package com.fitto.journal.repository;

import com.fitto.journal.domain.JournalReminder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;

import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/** 탈퇴 삭제는 여기 두지 않는다({@code UserDataPurger} 가 원시 SQL 로 순서를 관리한다) */
public interface JournalReminderRepository extends JpaRepository<JournalReminder, Long> {

    Optional<JournalReminder> findByUserId(Long userId);

    /** 매분 스케줄러 — 이 분에 울릴 행 (reminder_time 인덱스) */
    List<JournalReminder> findByReminderTime(LocalTime reminderTime);

    @Modifying
    void deleteByUserId(Long userId);
}
