package com.fitto.feed.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Year;
import java.time.ZoneId;
import java.util.List;

/**
 * 추억 리마인드의 날짜 규칙 — PLAN.md Memories.
 *
 * <p>순수 계산만 담아 테스트에서 직접 검증한다
 * ({@code CalendarDdayNotifier.eventsOccurringOn} 을 분리한 것과 같은 이유).
 * 특히 시간대 보정은 <b>JVM 기본 TZ 에 따라 결과가 달라지므로</b>, 저장 TZ 를
 * 파라미터로 받아 테스트가 UTC·KST 양쪽을 모두 고정할 수 있게 했다.
 */
final class MemoryDates {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private MemoryDates() {
    }

    static LocalDate todayInKst() {
        return LocalDate.now(KST);
    }

    /**
     * {@code fitto.storage-zone} 설정값 → 저장 TZ. 비어 있으면 JVM 기본 TZ.
     *
     * <p>{@link MemoriesService} 와 {@link MemoriesNotifier} 가 <b>같은 규칙</b>으로 풀어야 한다.
     * 둘이 다른 TZ 를 쓰면 "푸시는 왔는데 열면 비어 있다" 가 된다.
     */
    static ZoneId storageZoneOf(String configured) {
        return (configured == null || configured.isBlank())
                ? ZoneId.systemDefault()
                : ZoneId.of(configured);
    }

    /**
     * 연도 {@code year} 에서 "오늘과 같은 날"에 해당하는 일자들.
     *
     * <p>보통 1개지만, 윤년 보정이 걸리면 2개다.
     *
     * <table border="1">
     *   <caption>윤년 규칙</caption>
     *   <tr><th>오늘</th><th>대상 연도</th><th>조회 일자</th></tr>
     *   <tr><td>2/29 (윤년)</td><td>평년</td><td>2/28 로 당김</td></tr>
     *   <tr><td>2/28 (평년)</td><td>윤년</td><td>2/28 <b>+ 2/29</b></td></tr>
     *   <tr><td>그 외</td><td>—</td><td>같은 월·일</td></tr>
     * </table>
     *
     * <p>두 번째 행이 <b>역방향 보정</b>이다. 이게 없으면 윤년 2/29 에 남긴 기록이
     * 4년에 한 번만 보인다. 빠뜨리기 쉬우니 테스트로 고정한다.
     */
    static List<LocalDate> occurrencesIn(int year, LocalDate today) {
        LocalDate primary = occurrenceIn(year, today);
        if (today.getMonthValue() == 2 && today.getDayOfMonth() == 28
                && !today.isLeapYear() && Year.isLeap(year)) {
            return List.of(primary, LocalDate.of(year, 2, 29));
        }
        return List.of(primary);
    }

    /**
     * 그 해의 발생일 — 2/29 는 평년에 2/28 로 당긴다.
     * {@code CalendarEvent.occurrenceInYear} 와 같은 규칙이라 캘린더 D-day 와 어긋나지 않는다.
     */
    static LocalDate occurrenceIn(int year, LocalDate origin) {
        int lastDay = origin.getMonth().length(Year.isLeap(year));
        return LocalDate.of(year, origin.getMonth(), Math.min(origin.getDayOfMonth(), lastDay));
    }

    /**
     * KST 기준 하루의 시작을, 저장된 {@code created_at} 벽시계 값과 비교할 수 있는 형태로 바꾼다.
     *
     * <p><b>왜 필요한가</b>: {@code feed_posts.created_at} 은 {@code BaseTimeEntity} 의
     * {@code @CreatedDate} + {@code LocalDateTime} 이고 {@code hibernate.jdbc.time_zone} 도
     * 컨테이너 {@code TZ} 도 설정된 곳이 없다. 즉 <b>JVM 기본 TZ 의 벽시계 그대로</b> 저장된다.
     *
     * <table border="1">
     *   <caption>환경별 저장 TZ</caption>
     *   <tr><th>환경</th><th>JVM 기본 TZ</th><th>결과</th></tr>
     *   <tr><td>운영 (Railway)</td><td>UTC</td><td>KST 00:00~09:00 기록이 <b>전날</b>로 저장</td></tr>
     *   <tr><td>로컬 (Windows)</td><td>KST</td><td>그대로 저장</td></tr>
     * </table>
     *
     * <p>표시용 오차와 달리 추억은 <b>날짜 경계가 기능의 정의 자체</b>라 하루가 통째로 밀린다.
     */
    static LocalDateTime storageStartOfDay(LocalDate kstDate, ZoneId storage) {
        return kstDate.atStartOfDay(KST).withZoneSameInstant(storage).toLocalDateTime();
    }
}
