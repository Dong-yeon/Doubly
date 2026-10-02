package com.fitto.journal.repository;

import com.fitto.journal.domain.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * 모든 조회가 {@code userId} 를 첫 조건으로 받는다 — 남의 기록을 가리킬 수단을 만들지 않는다(분석 §2-2).
 * 탈퇴 삭제는 여기 두지 않는다({@code UserDataPurger} 가 원시 SQL 로 순서를 관리한다).
 */
public interface JournalEntryRepository extends JpaRepository<JournalEntry, Long> {

    Optional<JournalEntry> findByUserIdAndJournalDate(Long userId, LocalDate journalDate);

    /** 월 보기 — (user_id, journal_date) 유니크 인덱스를 그대로 탄다 */
    List<JournalEntry> findByUserIdAndJournalDateBetweenOrderByJournalDateAsc(Long userId, LocalDate from, LocalDate to);
}
