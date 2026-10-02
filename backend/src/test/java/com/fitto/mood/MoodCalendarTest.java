package com.fitto.mood;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.TestPro;
import com.fitto.common.time.KstClock;
import com.fitto.mood.dto.MoodCalendarResponse;
import com.fitto.mood.dto.MoodCalendarResponse.MoodCalendarDay;
import com.fitto.mood.dto.MoodDayResponse;
import com.fitto.mood.dto.MoodRequest;
import com.fitto.mood.service.MoodCalendarService;
import com.fitto.mood.service.MoodService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 무드 달력 — 하루 대표(마지막) 무드, 무료 30일 잠금, 그날 흐름.
 *
 * <p>MoodFlowTest 와 같은 설정이라 스프링 컨텍스트를 새로 만들지 않는다(CLAUDE.md 6절 — 힙).
 * 테스트 JVM 은 Asia/Seoul 이고 저장 TZ 도 그 기본값이라 created_at 벽시계 = KST 다.
 * 저장 TZ 가 UTC 인 운영의 날짜 경계는 MoodCalendarZoneTest 가 따로 고정한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MoodCalendarTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MoodService moodService;
    @Autowired MoodCalendarService moodCalendarService;
    @Autowired SubscriptionRepository subscriptionRepository;
    @Autowired JdbcTemplate jdbc;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private void connect(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
    }

    /** 무드를 남기고 그 행의 시각을 {@code at} 으로 옮긴다 */
    private void moodAt(Long userId, String emoji, String message, LocalDateTime at) {
        moodService.set(userId, new MoodRequest(emoji, null, message));
        Long id = jdbc.queryForObject("select max(id) from mood_statuses where user_id = ?", Long.class, userId);
        jdbc.update("update mood_statuses set created_at = ? where id = ?", at, id);
    }

    private static String monthOf(LocalDate date) {
        return YearMonth.from(date).toString();
    }

    @Test
    void 하루에_여러_번_바꾸면_그날_마지막_무드와_횟수가_나온다() {
        Long a = register("mcal-a@fitto.com");
        Long b = register("mcal-b@fitto.com");
        connect(a, b);
        LocalDate day = KstClock.today().minusDays(1);

        moodAt(a, "😊", null, day.atTime(9, 0));
        moodAt(a, "😴", null, day.atTime(23, 30));
        moodAt(b, "🥰", null, day.atTime(12, 0));

        MoodCalendarResponse mine = moodCalendarService.month(a, monthOf(day));
        MoodCalendarDay d = mine.days().stream().filter(x -> x.date().equals(day)).findFirst().orElseThrow();
        assertThat(d.mine().emoji()).isEqualTo("😴");
        assertThat(d.mine().count()).isEqualTo(2);
        assertThat(d.partner().emoji()).isEqualTo("🥰");
        assertThat(d.partner().count()).isEqualTo(1);

        // 상대 쪽에서 보면 자리가 뒤바뀐다
        MoodCalendarDay fromB = moodCalendarService.month(b, monthOf(day)).days().stream()
                .filter(x -> x.date().equals(day)).findFirst().orElseThrow();
        assertThat(fromB.mine().emoji()).isEqualTo("🥰");
        assertThat(fromB.partner().emoji()).isEqualTo("😴");
    }

    @Test
    void 자정_직전과_직후는_다른_날이다() {
        Long a = register("mcal-c@fitto.com");
        Long b = register("mcal-d@fitto.com");
        connect(a, b);
        LocalDate day = KstClock.today().minusDays(2);

        moodAt(a, "😊", null, day.atTime(23, 59, 59));
        moodAt(a, "😢", null, day.plusDays(1).atStartOfDay());

        assertThat(moodCalendarService.day(a, day).entries()).extracting("emoji").containsExactly("😊");
        assertThat(moodCalendarService.day(a, day.plusDays(1)).entries()).extracting("emoji").containsExactly("😢");
    }

    @Test
    void 그날_흐름에는_누구_것인지와_시각과_한마디가_시간순으로_실린다() {
        Long a = register("mcal-e@fitto.com");
        Long b = register("mcal-f@fitto.com");
        connect(a, b);
        LocalDate day = KstClock.today().minusDays(1);

        moodAt(b, "🤒", "감기 기운", day.atTime(8, 5));
        moodAt(a, "😊", null, day.atTime(10, 30));

        MoodDayResponse res = moodCalendarService.day(a, day);
        assertThat(res.locked()).isFalse();
        assertThat(res.entries()).hasSize(2);
        assertThat(res.entries().get(0).mine()).isFalse();
        assertThat(res.entries().get(0).message()).isEqualTo("감기 기운");
        assertThat(res.entries().get(0).time()).isEqualTo("08:05");
        assertThat(res.entries().get(1).mine()).isTrue();
        assertThat(res.entries().get(1).time()).isEqualTo("10:30");
    }

    @Test
    void 무료는_최근_30일만_보이고_그보다_앞은_잠긴다() {
        Long a = register("mcal-g@fitto.com");
        Long b = register("mcal-h@fitto.com");
        connect(a, b);
        LocalDate today = KstClock.today();
        LocalDate old = today.minusDays(40);
        LocalDate firstOpen = today.minusDays(29);

        moodAt(a, "😤", null, old.atTime(12, 0));
        moodAt(a, "😊", null, firstOpen.atTime(12, 0));

        MoodCalendarResponse oldMonth = moodCalendarService.month(a, monthOf(old));
        assertThat(oldMonth.lockedBefore()).isEqualTo(firstOpen);
        assertThat(oldMonth.days()).extracting(MoodCalendarDay::date).doesNotContain(old);
        assertThat(moodCalendarService.month(a, monthOf(firstOpen)).days())
                .extracting(MoodCalendarDay::date).contains(firstOpen);

        MoodDayResponse lockedDay = moodCalendarService.day(a, old);
        assertThat(lockedDay.locked()).isTrue();
        assertThat(lockedDay.entries()).isEmpty();
    }

    @Test
    void PRO_커플은_한_명만_결제해도_전체_기간을_본다() {
        Long a = register("mcal-i@fitto.com");
        Long b = register("mcal-j@fitto.com");
        connect(a, b);
        LocalDate old = KstClock.today().minusDays(40);
        moodAt(b, "😤", null, old.atTime(12, 0));

        TestPro.grant(subscriptionRepository, b);

        MoodCalendarResponse res = moodCalendarService.month(a, monthOf(old));
        assertThat(res.lockedBefore()).isNull();
        assertThat(res.days()).extracting(MoodCalendarDay::date).contains(old);
        assertThat(moodCalendarService.day(a, old).entries()).extracting("emoji").containsExactly("😤");
    }

    @Test
    void 연결_전이거나_달_형식이_틀리면_거절한다() {
        Long solo = register("mcal-k@fitto.com");
        assertThatThrownBy(() -> moodCalendarService.month(solo, "2026-10"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.RELATION_NOT_FOUND);

        Long a = register("mcal-l@fitto.com");
        Long b = register("mcal-m@fitto.com");
        connect(a, b);
        assertThatThrownBy(() -> moodCalendarService.month(a, "2026/10"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVALID_INPUT);
    }
}
