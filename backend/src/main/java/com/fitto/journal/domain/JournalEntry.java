package com.fitto.journal.domain;

import com.fitto.common.domain.BaseTimeEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * 나만의 하루 기록 — 상대·트레이너 누구에게도 내려가지 않는, 나에게 쓰는 그날의 페이지(V116).
 *
 * <p><b>관계가 아니라 사람에게 저장한다.</b> {@code relation_id} 가 없어서 관계가 끝나도, 지난 기록을
 * 지워도 남는다. 지워지는 길은 탈퇴({@code UserDataPurger}) 하나뿐이다.
 *
 * <p>하루에 하나다({@code (user_id, journal_date)} 유니크). 두 번째로 쓰러 오면 같은 기록을 이어 쓴다.
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §1.
 */
@Entity
@Table(name = "journal_entries")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JournalEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** KST 하루 — 서버가 {@code KstClock.today()} 이후 날짜를 거절한다 */
    @Column(name = "journal_date", nullable = false)
    private LocalDate journalDate;

    /**
     * 그날 남긴 기분(유니코드). {@code mood_statuses} 를 참조하지 않고 직접 들고 있는다 —
     * 그쪽은 관계 소유라 미연결이면 행이 없고 지난 기록 삭제 때 사라진다. 우리 이모지 id 도 두지 않는다
     * (관계가 지우는 자산이다).
     */
    @Column(name = "mood_emoji", length = 10)
    private String moodEmoji;

    @Column(length = 2000)
    private String body;

    /** 최대 1장, 전용 폴더({@code journal/})의 Cloudinary URL 만 */
    @Column(name = "photo_url", length = 500)
    private String photoUrl;

    @Builder
    private JournalEntry(Long userId, LocalDate journalDate, String moodEmoji, String body, String photoUrl) {
        this.userId = userId;
        this.journalDate = journalDate;
        this.moodEmoji = moodEmoji;
        this.body = body;
        this.photoUrl = photoUrl;
    }

    /** 통째로 바꾼다(PUT) — 비운 칸은 지운다는 뜻이다 */
    public void replace(String moodEmoji, String body, String photoUrl) {
        this.moodEmoji = moodEmoji;
        this.body = body;
        this.photoUrl = photoUrl;
    }
}
