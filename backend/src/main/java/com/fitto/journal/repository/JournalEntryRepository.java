package com.fitto.journal.repository;

import com.fitto.journal.domain.JournalEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    /**
     * 공유한 글을 적는다 — <b>아직 비어 있을 때만</b>. 두 번 눌러 공유가 동시에 들어와도 한쪽만 1 을 받고,
     * 0 을 받은 쪽은 트랜잭션을 되돌려 자기가 만든 글을 없앤다(JournalShareService). 주인 조건도 함께 건다.
     */
    @Modifying(clearAutomatically = true)
    @Query("update JournalEntry e set e.sharedPostId = :postId "
            + "where e.id = :id and e.userId = :userId and e.sharedPostId is null")
    int markShared(@Param("id") Long id, @Param("userId") Long userId, @Param("postId") Long postId);
}
