package com.fitto.journal.service;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.auth.service.UserDataPurger;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.time.KstClock;
import com.fitto.journal.domain.JournalSource;
import com.fitto.journal.dto.SaveJournalRequest;
import com.fitto.journal.repository.JournalReminderRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 하루 기록 리마인드(V125) — 고른 시각에, 그날 기록이 없을 때만, 고정 문구로.
 * MealReminderNotifierTest 와 같은 설정(@MockitoBean NotificationService 하나)이라 컨텍스트를 새로 만들지 않는다.
 */
@SpringBootTest
@ActiveProfiles("test")
class JournalReminderNotifierTest {

    @Autowired AuthService authService;
    @Autowired JournalReminderService reminderService;
    @Autowired JournalReminderNotifier notifier;
    @Autowired JournalService journalService;
    @Autowired JournalReminderRepository reminderRepository;
    @Autowired UserDataPurger userDataPurger;

    @MockitoBean NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private void write(Long userId, LocalDate date, String body) {
        journalService.save(userId, date, new SaveJournalRequest("😊", body, null, JournalSource.JOURNAL_LIST));
    }

    @Test
    void 고른_시각이_되면_고정_문구로_알리고_누르면_나의_하루가_열린다() {
        Long user = register("jr-fire@fitto.com");
        LocalTime time = LocalTime.of(22, 0);
        reminderService.set(user, time);
        clearInvocations(notificationService);

        notifier.remind(time, KstClock.today());

        verify(notificationService).notify(user, NotificationCategory.REMINDER,
                JournalReminderNotifier.TITLE, JournalReminderNotifier.BODY, PushLinks.JOURNAL);
    }

    @Test
    void 그날_이미_쓴_사람은_부르지_않는다() {
        Long user = register("jr-done@fitto.com");
        LocalTime time = LocalTime.of(21, 30);
        LocalDate today = KstClock.today();
        reminderService.set(user, time);
        write(user, today, "오늘은 썼다");
        clearInvocations(notificationService);

        notifier.remind(time, today);

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
    }

    @Test
    void 다른_시각이거나_끈_뒤에는_오지_않는다() {
        Long user = register("jr-off@fitto.com");
        reminderService.set(user, LocalTime.of(23, 0));
        clearInvocations(notificationService);

        notifier.remind(LocalTime.of(22, 59), KstClock.today());
        reminderService.remove(user);
        notifier.remind(LocalTime.of(23, 0), KstClock.today());

        verify(notificationService, never()).notify(eq(user), any(), anyString(), anyString(), anyString());
        assertThat(reminderService.get(user)).isNull();
    }

    @Test
    void 알림에는_기록_내용이_실리지_않는다() {
        Long user = register("jr-private@fitto.com");
        LocalDate today = KstClock.today();
        write(user, today.minusDays(1), "JOURNAL_SECRET_어제의_비밀");
        LocalTime time = LocalTime.of(22, 30);
        reminderService.set(user, time);
        clearInvocations(notificationService);

        notifier.remind(time, today);

        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(notificationService).notify(eq(user), any(), title.capture(), body.capture(), anyString());
        assertThat(title.getValue() + body.getValue()).doesNotContain("SECRET");
    }

    @Test
    void 시각을_바꾸면_한_행만_남고_분_단위로_맞춘다() {
        Long user = register("jr-move@fitto.com");
        reminderService.set(user, LocalTime.of(21, 0));
        reminderService.set(user, LocalTime.of(22, 15, 42));

        assertThat(reminderService.get(user).reminderTime()).isEqualTo(LocalTime.of(22, 15));
        assertThat(reminderRepository.findAll().stream().filter(r -> r.getUserId().equals(user))).hasSize(1);
    }

    @Test
    @Transactional
    void 리마인드를_켠_사람도_탈퇴하면_FK_위반_없이_지워진다() {
        Long user = register("jr-bye@fitto.com");
        reminderService.set(user, LocalTime.of(22, 0));

        userDataPurger.purgeFor(user);

        assertThat(reminderRepository.findByUserId(user)).isEmpty();
    }
}
