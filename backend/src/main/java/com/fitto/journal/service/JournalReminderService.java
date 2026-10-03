package com.fitto.journal.service;

import com.fitto.journal.domain.JournalReminder;
import com.fitto.journal.dto.JournalReminderResponse;
import com.fitto.journal.repository.JournalReminderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;

/**
 * 하루 기록 리마인드 켜기·바꾸기·끄기(옵트인) — 발송은 {@link JournalReminderNotifier}.
 * {@code MealReminderService} 와 같은 분리다.
 */
@Service
@Transactional(readOnly = true)
public class JournalReminderService {

    private final JournalReminderRepository repository;

    public JournalReminderService(JournalReminderRepository repository) {
        this.repository = repository;
    }

    /** 꺼져 있으면 null */
    public JournalReminderResponse get(Long userId) {
        return repository.findByUserId(userId).map(JournalReminderResponse::from).orElse(null);
    }

    @Transactional
    public JournalReminderResponse set(Long userId, LocalTime reminderTime) {
        // 스케줄러가 이 값으로 정확히 맞추므로 분 단위로 고정한다(화면도 분 단위 칩만 준다)
        LocalTime minute = reminderTime.withSecond(0).withNano(0);
        JournalReminder reminder = repository.findByUserId(userId)
                .orElseGet(() -> JournalReminder.builder().userId(userId).reminderTime(minute).build());
        reminder.updateTime(minute);
        return JournalReminderResponse.from(repository.save(reminder));
    }

    @Transactional
    public void remove(Long userId) {
        repository.deleteByUserId(userId);
    }
}
