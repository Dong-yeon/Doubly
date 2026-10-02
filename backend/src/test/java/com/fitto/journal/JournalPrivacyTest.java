package com.fitto.journal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLog;
import com.fitto.common.analytics.EventLogRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.dataexport.DataExportService;
import com.fitto.dataexport.ExportSection;
import com.fitto.diet.service.MealService;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesService;
import com.fitto.journal.domain.JournalSource;
import com.fitto.journal.dto.SaveJournalRequest;
import com.fitto.journal.repository.JournalEntryRepository;
import com.fitto.journal.service.JournalService;
import com.fitto.mood.service.MoodService;
import com.fitto.relation.service.RelationRecordPurger;
import com.fitto.relation.service.RelationService;
import com.fitto.common.time.KstClock;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.service.TrainerService;
import com.fitto.workout.service.WorkoutService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 나만의 하루 기록은 상대·트레이너 누구의 응답에도 실리지 않는다 —
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §2-3.
 *
 * <p><b>필드 이름이 아니라 값으로 본다.</b> 본문에 고유 표식을 넣고, 남이 받는 응답을 JSON 문자열로
 * 직렬화해 그 표식이 나오지 않는지 확인한다. 누가 나중에 다른 이름으로 실어도 잡히게 하려는 것이다.
 *
 * <p>설정은 {@code PartnerPrivacyTest} 와 똑같이 둔다(@MockitoBean·properties 없음) — 새 스프링
 * 컨텍스트를 만들지 않는다(CLAUDE.md 6절).
 */
@SpringBootTest
@ActiveProfiles("test")
class JournalPrivacyTest {

    private static final String IP = "127.0.0.1";
    private static final String PHOTO = "https://res.cloudinary.com/demo/image/upload/v1/fitto/journal/";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired RelationRecordPurger relationRecordPurger;
    @Autowired JournalService journalService;
    @Autowired JournalEntryRepository journalRepository;
    @Autowired FeedService feedService;
    @Autowired MemoriesService memoriesService;
    @Autowired MoodService moodService;
    @Autowired MealService mealService;
    @Autowired WorkoutService workoutService;
    @Autowired TrainerService trainerService;
    @Autowired DataExportService dataExportService;
    @Autowired EventLogRepository eventLogRepository;
    @Autowired ObjectMapper objectMapper;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP).user().id();
    }

    /** [A, B] — 커플로 연결된 두 사람 */
    private Long[] couple(String tag) {
        Long a = register("journal-" + tag + "-a@fitto.com");
        Long b = register("journal-" + tag + "-b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        return new Long[]{a, b};
    }

    private static String marker(String tag) {
        return "JOURNAL_SECRET_" + tag + "_7f3a";
    }

    private void write(Long userId, LocalDate date, String body, String photo) {
        journalService.save(userId, date, new SaveJournalRequest("😊", body, photo, JournalSource.MOOD_PICKER));
    }

    private String json(Object value) throws Exception {
        return objectMapper.writeValueAsString(value);
    }

    // 1 ──────────────────────────────────────────────────────────────────────

    @Test
    void 상대는_내_기록을_조회할_수_없고_자기_빈_목록만_받는다() {
        Long[] ab = couple("p1");
        LocalDate today = KstClock.today();
        write(ab[0], today, marker("p1"), PHOTO + "p1.jpg");

        assertThat(journalService.month(ab[1], today.toString().substring(0, 7))).isEmpty();
        assertThatThrownBy(() -> journalService.day(ab[1], today))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.JOURNAL_NOT_FOUND);
        // 본인은 그대로 본다
        assertThat(journalService.day(ab[0], today).body()).isEqualTo(marker("p1"));
    }

    // 2 ──────────────────────────────────────────────────────────────────────

    @Test
    void 상대가_받는_피드_무드_관계_오늘기록_응답에_내_기록이_없다() throws Exception {
        Long[] ab = couple("p2");
        String secret = marker("p2");
        String photo = PHOTO + "p2.jpg";
        write(ab[0], KstClock.today(), secret, photo);

        List<String> partnerViews = List.of(
                json(feedService.timeline(ab[1], null, 50)),
                json(feedService.photos(ab[1], null, 50, null)),
                json(memoriesService.memories(ab[1], null)),
                json(relationService.findMyRelations(ab[1])),
                json(moodService.current(ab[1])),
                json(mealService.partnerToday(ab[1])),
                json(workoutService.partnerToday(ab[1])));
        for (String view : partnerViews) {
            assertThat(view).doesNotContain(secret).doesNotContain(photo);
        }
    }

    // 3 ──────────────────────────────────────────────────────────────────────

    @Test
    void 상대의_내보내기에는_없고_내_내보내기에만_있다() throws Exception {
        Long[] ab = couple("p3");
        String secret = marker("p3");
        write(ab[0], KstClock.today(), secret, PHOTO + "p3.jpg");

        for (ExportSection section : ExportSection.values()) {
            assertThat(json(dataExportService.page(ab[1], section.key(), null, 500)))
                    .as("상대의 %s 섹션", section.key())
                    .doesNotContain(secret);
        }
        String mine = json(dataExportService.page(ab[0], ExportSection.JOURNAL_ENTRIES.key(), null, 500));
        assertThat(mine).contains(secret).contains(PHOTO + "p3.jpg");
    }

    // 4 ──────────────────────────────────────────────────────────────────────

    @Test
    void 트레이너는_회원의_기록을_받지_않는다() throws Exception {
        Long trainer = register("journal-p4-t@fitto.com");
        trainerService.register(trainer, new TrainerProfileRequest("PT", "소개", null, null, 10, true));
        Long member = register("journal-p4-m@fitto.com");
        relationService.connectTrainer(member, relationService.createTrainerInvite(trainer).code());
        String secret = marker("p4");
        write(member, KstClock.today(), secret, null);

        assertThat(json(trainerService.dashboard(trainer))).doesNotContain(secret);
        assertThat(json(trainerService.memberWorkouts(trainer, member))).doesNotContain(secret);
    }

    // 6 ──────────────────────────────────────────────────────────────────────

    @Test
    void 지난_기록을_지워도_내_기록과_사진은_남는다() {
        Long[] ab = couple("p6");
        LocalDate today = KstClock.today();
        String photo = PHOTO + "p6.jpg";
        write(ab[0], today, marker("p6"), photo);
        Long relationId = relationService.findMyRelations(ab[0]).get(0).id();

        relationService.endRelation(ab[1], relationId);
        List<String> purgedUrls = relationRecordPurger.purge(relationId);

        assertThat(purgedUrls).doesNotContain(photo);
        assertThat(journalService.day(ab[0], today).photoUrl()).isEqualTo(photo);
        assertThat(journalService.day(ab[0], today).body()).isEqualTo(marker("p6"));
    }

    // 8 ──────────────────────────────────────────────────────────────────────

    @Test
    void 계측_이벤트에는_입구와_신규여부만_남고_본문은_없다() {
        Long me = register("journal-p8@fitto.com");
        String secret = marker("p8");
        LocalDate today = KstClock.today();
        write(me, today, secret, PHOTO + "p8.jpg");
        write(me, today, secret + " 이어서", null);

        List<EventLog> mine = eventLogRepository.findAll().stream().filter(e -> me.equals(e.getUserId())).toList();
        assertThat(mine).allSatisfy(e -> {
            assertThat(String.valueOf(e.getDetail())).doesNotContain(secret).doesNotContain("journal/");
        });
        assertThat(mine.stream().filter(e -> AnalyticsEvent.JOURNAL_SAVED.equals(e.getEventType()))
                .map(EventLog::getDetail))
                .containsExactlyInAnyOrder("MOOD_PICKER:NEW", "MOOD_PICKER:EDIT");
        // 새 기록을 만들 때만 FEATURE_USED(JOURNAL) — 이어 쓰기는 세지 않는다
        assertThat(mine.stream().filter(e -> AnalyticsEvent.FEATURE_USED.equals(e.getEventType())
                && "JOURNAL".equals(e.getDetail()))).hasSize(1);
    }

    // 저장 규칙 ─────────────────────────────────────────────────────────────

    @Test
    void 같은_날_두_번_쓰면_한_기록을_고친다() {
        Long me = register("journal-upsert@fitto.com");
        LocalDate today = KstClock.today();
        write(me, today, "처음", PHOTO + "u1.jpg");
        write(me, today, "다시", null);

        assertThat(journalRepository.findByUserIdAndJournalDateBetweenOrderByJournalDateAsc(me, today, today))
                .singleElement()
                .satisfies(e -> {
                    assertThat(e.getBody()).isEqualTo("다시");
                    assertThat(e.getPhotoUrl()).isNull();
                });
    }

    @Test
    void 같은_날짜로_동시에_저장해도_한_행만_남는다() throws Exception {
        Long me = register("journal-race@fitto.com");
        LocalDate day = KstClock.today().minusDays(1);
        int threads = 4;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<?>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                String body = "동시 " + i;
                futures.add(pool.submit(() -> {
                    start.await();
                    write(me, day, body, null);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> f : futures) {
                f.get(30, TimeUnit.SECONDS);   // 유니크 경합에 진 쪽도 예외 없이 끝나야 한다
            }
        } finally {
            pool.shutdownNow();
        }
        assertThat(journalRepository.findByUserIdAndJournalDateBetweenOrderByJournalDateAsc(me, day, day)).hasSize(1);
    }

    @Test
    void 미래_날짜_빈_기록_다른_폴더_사진은_거절한다() {
        Long me = register("journal-reject@fitto.com");
        LocalDate today = KstClock.today();

        assertThatThrownBy(() -> write(me, today.plusDays(1), "내일", null))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> journalService.save(me, today, new SaveJournalRequest(" ", "  ", null, null)))
                .isInstanceOf(BusinessException.class);
        // 상대 피드 사진 주소를 붙여 두고 내 기록을 지워 그 파일을 지우는 경로를 막는다
        assertThatThrownBy(() -> write(me, today, "남의 사진",
                "https://res.cloudinary.com/demo/image/upload/v1/fitto/feed.jpg"))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PHOTO_URL);
        assertThatThrownBy(() -> write(me, today, "우회",
                PHOTO + "../other/x.jpg"))
                .isInstanceOf(BusinessException.class);
        // 지난 날짜는 쓸 수 있다
        write(me, today.minusDays(3), "그저께의 그저께", null);
    }
}
