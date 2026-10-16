package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.FastingEndReason;
import com.fitto.diet.domain.FastingPlan;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.FastingHistoryItem;
import com.fitto.diet.dto.FastingSettingsRequest;
import com.fitto.diet.dto.FastingStatusResponse;
import com.fitto.diet.dto.MealFastingOutcome;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.dto.StartFastingRequest;
import com.fitto.diet.repository.FastingSessionRepository;
import com.fitto.diet.service.FastingService;
import com.fitto.diet.service.FastingTargetNotifier;
import com.fitto.diet.service.MealService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 간헐적 단식 ↔ 끼니 기록 연동(2026-10-16) — 식사 저장으로 자동 종료, 저녁 뒤 시작 제안, 되돌리기, 시작 시각 앞당기기,
 * 목표 도달 본인 푸시. 판정이 "지금 몇 시인가"에 달려 있어 대부분 기준 시각을 넣는 오버로드로 검증한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class FastingMealLinkFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    FastingService fastingService;
    @Autowired
    FastingSessionRepository fastingRepository;
    @Autowired
    MealService mealService;
    @Autowired
    FastingTargetNotifier targetNotifier;

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    /** KST 날짜·시각 → 서버 벽시계(단식 세션이 쓰는 축) */
    private static LocalDateTime kst(LocalDate date, int hour, int minute) {
        return ZonedDateTime.of(date, LocalTime.of(hour, minute), KstClock.ZONE)
                .withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
    }

    private FastingSession fastStartedAt(Long user, FastingPlan plan, int hours, LocalDateTime startedAt) {
        return fastingRepository.save(FastingSession.builder()
                .userId(user).planType(plan).targetHours(hours).startedAt(startedAt).build());
    }

    private SaveMealRequest meal(LocalDate date, MealType type, String clientRequestId) {
        return new SaveMealRequest(date, type, "테스트", null, 400, null, null, null,
                null, null, null, null, false, clientRequestId);
    }

    private FastingSession reload(FastingSession s) {
        return fastingRepository.findById(s.getId()).orElseThrow();
    }

    // ── 자동 종료 ──────────────────────────────────────────────────────

    @Test
    void 어젯밤_시작한_단식은_오늘_아침_기록으로_끝나고_응답에_실린다() {
        Long user = register("fml-end1@fitto.com");
        LocalDate today = KstClock.today();
        FastingSession s = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));

        MealResponse res = mealService.save(user, meal(today, MealType.BREAKFAST, null));

        assertThat(res.fasting()).isNotNull();
        assertThat(res.fasting().result()).isEqualTo(MealFastingOutcome.ENDED);
        assertThat(res.fasting().status().active()).isFalse();
        assertThat(res.fasting().status().elapsedMin()).isGreaterThanOrEqualTo(4 * 60);
        FastingSession after = reload(s);
        assertThat(after.isActive()).isFalse();
        assertThat(after.getEndedBy()).isEqualTo(FastingEndReason.MEAL);
    }

    @Test
    void 아침을_거르고_점심이_첫_식사여도_끝낸다() {
        Long user = register("fml-end2@fitto.com");
        LocalDate day = KstClock.today();
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(day.minusDays(1), 20, 0));

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.LUNCH, kst(day, 12, 30));

        assertThat(out.result()).isEqualTo(MealFastingOutcome.ENDED);
        assertThat(out.status().achieved()).isTrue();
    }

    @Test
    void 지난_날짜_식사를_몰아_적으면_단식을_건드리지_않는다() {
        Long user = register("fml-past@fitto.com");
        LocalDate today = KstClock.today();
        FastingSession s = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));

        MealResponse res = mealService.save(user, meal(today.minusDays(1), MealType.LUNCH, null));

        assertThat(res.fasting()).isNull();
        assertThat(reload(s).isActive()).isTrue();
    }

    @Test
    void 시작한_지_4시간이_안_됐으면_끝내지_않고_묻는다() {
        Long user = register("fml-short@fitto.com");
        LocalDate day = KstClock.today();
        LocalDateTime now = kst(day, 21, 30);
        FastingSession s = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusMinutes(60));

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.SNACK, now);

        assertThat(out.result()).isEqualTo(MealFastingOutcome.ASK_END);
        assertThat(out.status().active()).isTrue();
        assertThat(reload(s).isActive()).isTrue();
    }

    @Test
    void 자정_직후_기록도_시작_4시간_전이면_묻는다() {
        Long user = register("fml-midnight@fitto.com");
        LocalDate day = KstClock.today();
        LocalDateTime now = kst(day, 0, 20);
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(day.minusDays(1), 22, 30));

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.SNACK, now);

        assertThat(out.result()).isEqualTo(MealFastingOutcome.ASK_END);
    }

    @Test
    void 오늘_오후에_시작한_단식에_오늘_낮_끼니를_늦게_적으면_묻는다() {
        Long user = register("fml-backfill@fitto.com");
        LocalDate day = KstClock.today();
        FastingSession s = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(day, 18, 0));

        // 6시간 지나 4시간 문턱은 넘었지만, 같은 날 오후에 시작한 단식이다 — 낮 점심을 이제 적는 중일 수 있다
        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.LUNCH, kst(day, 23, 50));

        assertThat(out.result()).isEqualTo(MealFastingOutcome.ASK_END);
        assertThat(reload(s).isActive()).isTrue();
    }

    @Test
    void 자동_종료를_끄면_아무_일도_없다() {
        Long user = register("fml-off@fitto.com");
        LocalDate day = KstClock.today();
        FastingSession s = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(day.minusDays(1), 20, 0));
        fastingService.updateSettings(user, new FastingSettingsRequest(false, null));

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.BREAKFAST, kst(day, 9, 0));

        assertThat(out).isNull();
        assertThat(reload(s).isActive()).isTrue();
        // 한쪽만 바꿨으니 저녁 제안은 그대로 켜져 있다
        assertThat(fastingService.settings(user).offerDinner()).isTrue();
        assertThat(fastingService.settings(user).autoEnd()).isFalse();
    }

    @Test
    void 같은_요청을_다시_보내도_새_단식을_끝내지_않는다() {
        Long user = register("fml-idem@fitto.com");
        LocalDate today = KstClock.today();
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));
        SaveMealRequest req = meal(today, MealType.BREAKFAST, "fml-idem-req-1");
        assertThat(mealService.save(user, req).fasting().result()).isEqualTo(MealFastingOutcome.ENDED);

        // 응답을 못 받은 앱이 재시도하기 전에 사용자가 새 단식을 시작했다
        FastingSession next = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 23, 0));
        MealResponse replay = mealService.save(user, req);

        assertThat(replay.fasting()).isNull();
        assertThat(reload(next).isActive()).isTrue();
    }

    @Test
    void 데이트_식단이어도_상대_단식은_끝내지_않는다() {
        Long a = register("fml-date-a@fitto.com");
        Long b = register("fml-date-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        LocalDate today = KstClock.today();
        FastingSession mine = fastStartedAt(a, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));
        FastingSession partners = fastStartedAt(b, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));

        mealService.save(a, new SaveMealRequest(today, MealType.BREAKFAST, "브런치", null, 800, null, null, null,
                null, null, null, null, true, null));

        assertThat(reload(mine).isActive()).isFalse();
        assertThat(reload(partners).isActive()).isTrue();
    }

    // ── 저녁 뒤 시작 제안 ───────────────────────────────────────────────

    @Test
    void 단식해_본_사람이_저녁을_적으면_지난번_플랜으로_시작을_제안한다() {
        Long user = register("fml-offer1@fitto.com");
        LocalDate day = KstClock.today();
        FastingSession prev = fastStartedAt(user, FastingPlan.EIGHTEEN_SIX, 18, kst(day.minusDays(3), 20, 0));
        prev.end(kst(day.minusDays(2), 14, 0), FastingEndReason.MANUAL);
        fastingRepository.save(prev);

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.DINNER, kst(day, 19, 0));

        assertThat(out.result()).isEqualTo(MealFastingOutcome.OFFER_START);
        assertThat(out.suggestPlan()).isEqualTo(FastingPlan.EIGHTEEN_SIX);
        assertThat(out.suggestHours()).isEqualTo(18);
    }

    @Test
    void 단식해_본_적_없거나_오래전이면_제안하지_않는다() {
        Long never = register("fml-offer-never@fitto.com");
        Long old = register("fml-offer-old@fitto.com");
        LocalDate day = KstClock.today();
        LocalDateTime now = kst(day, 19, 0);
        FastingSession prev = fastStartedAt(old, FastingPlan.SIXTEEN_EIGHT, 16, now.minusDays(31));
        prev.end(now.minusDays(31).plusHours(16), FastingEndReason.MANUAL);
        fastingRepository.save(prev);

        assertThat(fastingService.onMealSaved(never, day, MealType.DINNER, now)).isNull();
        assertThat(fastingService.onMealSaved(old, day, MealType.DINNER, now)).isNull();
    }

    @Test
    void 저녁이_아니거나_제안을_끄면_제안하지_않는다() {
        Long user = register("fml-offer-off@fitto.com");
        LocalDate day = KstClock.today();
        FastingSession prev = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(day.minusDays(2), 20, 0));
        prev.end(kst(day.minusDays(1), 12, 0), FastingEndReason.MANUAL);
        fastingRepository.save(prev);

        assertThat(fastingService.onMealSaved(user, day, MealType.LUNCH, kst(day, 12, 0))).isNull();
        assertThat(fastingService.onMealSaved(user, day.minusDays(1), MealType.DINNER, kst(day, 9, 0))).isNull();

        fastingService.updateSettings(user, new FastingSettingsRequest(null, false));
        assertThat(fastingService.onMealSaved(user, day, MealType.DINNER, kst(day, 19, 0))).isNull();
    }

    @Test
    void 저녁_뒤_이미_단식_중이면_제안이_아니라_묻기다() {
        Long user = register("fml-offer-active@fitto.com");
        LocalDate day = KstClock.today();
        LocalDateTime now = kst(day, 19, 30);
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusMinutes(30));

        MealFastingOutcome out = fastingService.onMealSaved(user, day, MealType.DINNER, now);

        assertThat(out.result()).isEqualTo(MealFastingOutcome.ASK_END);
    }

    // ── 되돌리기 ────────────────────────────────────────────────────────

    @Test
    void 식사로_끝난_단식은_되돌리면_원래_시작_시각으로_이어진다() {
        Long user = register("fml-reopen1@fitto.com");
        LocalDate today = KstClock.today();
        LocalDateTime startedAt = kst(today.minusDays(1), 20, 0);
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, startedAt);
        mealService.save(user, meal(today, MealType.BREAKFAST, null));

        FastingStatusResponse reopened = fastingService.reopen(user);

        assertThat(reopened.active()).isTrue();
        assertThat(reopened.startedAt()).isEqualTo(startedAt);
        assertThat(fastingService.active(user).active()).isTrue();
        // 두 번은 안 된다 — 이미 진행 중이다
        assertThatThrownBy(() -> fastingService.reopen(user)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 버튼으로_끝냈거나_시간이_지났거나_끝난_단식이_없으면_되돌릴_수_없다() {
        Long manual = register("fml-reopen-manual@fitto.com");
        fastingService.start(manual, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, null));
        fastingService.end(manual);
        assertThatThrownBy(() -> fastingService.reopen(manual)).isInstanceOf(BusinessException.class);

        Long late = register("fml-reopen-late@fitto.com");
        FastingSession s = fastStartedAt(late, FastingPlan.SIXTEEN_EIGHT, 16, LocalDateTime.now().minusHours(17));
        s.end(LocalDateTime.now().minusMinutes(11), FastingEndReason.MEAL);
        fastingRepository.save(s);
        assertThatThrownBy(() -> fastingService.reopen(late)).isInstanceOf(BusinessException.class);

        Long nobody = register("fml-reopen-none@fitto.com");
        assertThatThrownBy(() -> fastingService.reopen(nobody)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 식사로_끝난_뒤_새_단식을_시작했으면_옛_단식을_되돌리지_않는다() {
        Long user = register("fml-reopen-new@fitto.com");
        LocalDate today = KstClock.today();
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, kst(today.minusDays(1), 20, 0));
        mealService.save(user, meal(today, MealType.BREAKFAST, null));
        fastingService.start(user, new StartFastingRequest(FastingPlan.OMAD, null, null));
        fastingService.end(user);

        assertThatThrownBy(() -> fastingService.reopen(user)).isInstanceOf(BusinessException.class);
    }

    // ── 시작 시각 앞당기기 ─────────────────────────────────────────────

    @Test
    void 다_먹은_지_90분이면_90분_전부터_센다() {
        Long user = register("fml-ago1@fitto.com");

        FastingStatusResponse res = fastingService.start(user, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, 90));

        assertThat(res.elapsedMin()).isBetween(89, 91);
    }

    @Test
    void 직전_단식이_끝난_시각보다_앞으로는_당기지_않는다() {
        Long user = register("fml-ago-clamp@fitto.com");
        // DB 는 마이크로초까지만 담는다 — 비교가 나노초 차이로 깨지지 않게 초 단위로
        LocalDateTime endedAt = LocalDateTime.now().minusMinutes(30).withNano(0);
        FastingSession prev = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, endedAt.minusHours(16));
        prev.end(endedAt, FastingEndReason.MEAL);
        fastingRepository.save(prev);

        FastingStatusResponse res = fastingService.start(user, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, 360));

        assertThat(res.startedAt()).isEqualTo(endedAt);
        assertThat(res.elapsedMin()).isBetween(29, 31);
    }

    @Test
    void 시작_시각은_0분에서_6시간_전까지만_받는다() {
        assertThat(validator.validate(new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, 360))).isEmpty();
        assertThat(validator.validate(new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, null))).isEmpty();
        assertThat(validator.validate(new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, 361))).hasSize(1);
        assertThat(validator.validate(new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, -1))).hasSize(1);
    }

    // ── 이력 ────────────────────────────────────────────────────────────

    @Test
    void 이력은_진행_중을_포함해_최근_것부터_달성_여부와_함께_준다() {
        Long user = register("fml-hist@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        FastingSession done = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusDays(2));
        done.end(now.minusDays(2).plusHours(17), FastingEndReason.MANUAL);
        fastingRepository.save(done);
        FastingSession failed = fastStartedAt(user, FastingPlan.EIGHTEEN_SIX, 18, now.minusDays(1));
        failed.end(now.minusDays(1).plusHours(10), FastingEndReason.MEAL);
        fastingRepository.save(failed);
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(2));
        FastingSession tooOld = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusDays(40));
        tooOld.end(now.minusDays(40).plusHours(16), FastingEndReason.MANUAL);
        fastingRepository.save(tooOld);

        List<FastingHistoryItem> items = fastingService.history(user, 28);

        assertThat(items).hasSize(3);
        assertThat(items.get(0).endedAt()).isNull();
        assertThat(items.get(1).achieved()).isFalse();
        assertThat(items.get(1).endedBy()).isEqualTo(FastingEndReason.MEAL);
        assertThat(items.get(2).achieved()).isTrue();
        assertThat(items.get(2).elapsedMin()).isEqualTo(17 * 60);
    }

    @Test
    void 이력_기간은_1일에서_120일까지다() {
        Long user = register("fml-hist-range@fitto.com");

        assertThatThrownBy(() -> fastingService.history(user, 0)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> fastingService.history(user, 121)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> fastingService.history(user, -5)).isInstanceOf(BusinessException.class);
        assertThat(fastingService.history(user, 120)).isEmpty();
    }

    @Test
    void 설정은_처음엔_둘_다_켜져_있다() {
        Long user = register("fml-settings@fitto.com");

        assertThat(fastingService.settings(user).autoEnd()).isTrue();
        assertThat(fastingService.settings(user).offerDinner()).isTrue();
        // 빈 요청은 아무것도 바꾸지 않는다
        assertThat(fastingService.updateSettings(user, new FastingSettingsRequest(null, null)).autoEnd()).isTrue();
    }

    // ── 목표 도달 본인 푸시 ─────────────────────────────────────────────

    @Test
    void 목표에_닿은_단식은_한_번만_알리고_묵은_건_조용히_표시만_한다() {
        Long fresh = register("fml-notify-fresh@fitto.com");
        Long stale = register("fml-notify-stale@fitto.com");
        Long notYet = register("fml-notify-notyet@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        FastingSession reached = fastStartedAt(fresh, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(16).minusMinutes(5));
        FastingSession old = fastStartedAt(stale, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(18));
        FastingSession running = fastStartedAt(notYet, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(15));

        assertThat(targetNotifier.notifyReached(now)).isGreaterThanOrEqualTo(1);

        assertThat(reload(reached).getTargetNotifiedAt()).isNotNull();
        assertThat(reload(old).getTargetNotifiedAt()).isNotNull();
        assertThat(reload(running).getTargetNotifiedAt()).isNull();
        // 다음 분에 다시 돌아도 이 단식들은 다시 보내지 않는다
        LocalDateTime firstMark = reload(reached).getTargetNotifiedAt();
        targetNotifier.notifyReached(now.plusMinutes(1));
        assertThat(reload(reached).getTargetNotifiedAt()).isEqualTo(firstMark);
    }

    // ── 동시 시작 (docs/HOME_FASTING_TIMER_ANALYSIS_2026-10-16.md §6-1) ──────────────

    @Test
    void 동시에_시작해도_진행_중_단식은_하나뿐이다() throws Exception {
        Long user = register("fml-race@fitto.com");
        int n = 6;
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger ok = new AtomicInteger();
        AtomicInteger rejected = new AtomicInteger();
        List<Future<?>> futures = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            futures.add(pool.submit(() -> {
                go.await();
                try {
                    fastingService.start(user, new StartFastingRequest(FastingPlan.SIXTEEN_EIGHT, null, null));
                    ok.incrementAndGet();
                } catch (BusinessException e) {
                    rejected.incrementAndGet();
                }
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : futures) {
            f.get(30, TimeUnit.SECONDS);
        }
        pool.shutdown();

        assertThat(ok.get()).isEqualTo(1);
        assertThat(rejected.get()).isEqualTo(n - 1);
        long open = fastingRepository.findAll().stream()
                .filter(s -> s.getUserId().equals(user) && s.getEndedAt() == null).count();
        assertThat(open).isEqualTo(1);
    }

    @Test
    void 예전에_생긴_중복_진행_단식이_있어도_조회와_종료가_깨지지_않는다() {
        Long user = register("fml-dup@fitto.com");
        LocalDateTime now = LocalDateTime.now();
        fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(3));
        FastingSession newer = fastStartedAt(user, FastingPlan.SIXTEEN_EIGHT, 16, now.minusHours(3));

        FastingStatusResponse active = fastingService.active(user);
        assertThat(active.active()).isTrue();

        fastingService.end(user);
        assertThat(reload(newer).getEndedAt()).isNotNull();
        // 남은 하나도 다음 종료로 정리된다
        assertThat(fastingService.active(user).active()).isTrue();
        fastingService.end(user);
        assertThat(fastingService.active(user).active()).isFalse();
    }
}
