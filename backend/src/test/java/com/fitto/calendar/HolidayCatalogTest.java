package com.fitto.calendar;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.calendar.dto.HolidayResponse;
import com.fitto.calendar.dto.HolidayResponse.Holiday;
import com.fitto.calendar.service.HolidayCatalog;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Year;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 공휴일 표 검증 — 스프링 없이 실제 리소스를 읽는다.
 *
 * <p>날짜를 하나하나 다시 적어 대조하면 표를 옮겨 적은 것과 같은 실수를 테스트도 한다. 그래서
 * <b>정부가 발표한 집계 숫자</b>와 맞춘다 — 표에서 하루가 빠지거나 요일이 틀리면 숫자가 어긋난다.
 * <ul>
 *   <li>2027 월력요항: 일요일 외 공휴일 24일, 그중 일요일과 겹치는 4일 → 관공서 공휴일 72일,
 *       토요일과 겹치는 5일 → 주 5일제 휴일 119일.</li>
 *   <li>2026: 월력요항 20일 + 발표 뒤 지정된 노동절·제헌절 → 22일. 2027 월력요항이 밝힌
 *       "실질적인 2026년 휴일은 120일".</li>
 * </ul>
 */
class HolidayCatalogTest {

    private final HolidayCatalog catalog = new HolidayCatalog(new ObjectMapper());

    private static long sundays(int year) {
        return days(year).filter(d -> d.getDayOfWeek() == DayOfWeek.SUNDAY).count();
    }

    private static long saturdays(int year) {
        return days(year).filter(d -> d.getDayOfWeek() == DayOfWeek.SATURDAY).count();
    }

    private static java.util.stream.Stream<LocalDate> days(int year) {
        return IntStream.rangeClosed(1, Year.of(year).length()).mapToObj(d -> Year.of(year).atDay(d));
    }

    /** 관공서 공휴일(적색표기일) 수 — 일요일 + 일요일이 아닌 공휴일 */
    private static long redDays(int year, List<Holiday> holidays) {
        return sundays(year) + holidays.stream().filter(h -> h.date().getDayOfWeek() != DayOfWeek.SUNDAY).count();
    }

    /** 주 5일제 휴일 — 토·일 + 평일 공휴일 */
    private static long daysOff(int year, List<Holiday> holidays) {
        return sundays(year) + saturdays(year) + holidays.stream()
                .filter(h -> h.date().getDayOfWeek() != DayOfWeek.SUNDAY
                             && h.date().getDayOfWeek() != DayOfWeek.SATURDAY)
                .count();
    }

    @Test
    void 이천이십칠년은_월력요항_집계와_맞는다() {
        List<Holiday> h = catalog.of(2027).holidays();
        assertThat(h).hasSize(24);
        assertThat(redDays(2027, h)).isEqualTo(72);
        assertThat(daysOff(2027, h)).isEqualTo(119);
    }

    @Test
    void 이천이십육년은_노동절_제헌절까지_더해_실질_휴일_120일이다() {
        List<Holiday> h = catalog.of(2026).holidays();
        assertThat(h).hasSize(22);
        assertThat(h).extracting(Holiday::name).contains("노동절", "제헌절");
        assertThat(daysOff(2026, h)).isEqualTo(120);
    }

    /** 대체공휴일은 정의상 평일이다 — 주말에 찍혀 있으면 날짜를 잘못 옮긴 것이다. */
    @Test
    void 대체공휴일은_모두_평일이다() {
        for (int year : List.of(2025, 2026, 2027)) {
            assertThat(catalog.of(year).holidays())
                    .filteredOn(h -> h.name().equals("대체공휴일"))
                    .isNotEmpty()
                    .allSatisfy(h -> assertThat(h.date().getDayOfWeek())
                            .isNotIn(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY));
        }
    }

    @Test
    void 날짜순이고_겹치는_날이_없다() {
        for (int year : List.of(2025, 2026, 2027)) {
            List<LocalDate> dates = catalog.of(year).holidays().stream().map(Holiday::date).toList();
            assertThat(dates).isSorted().doesNotHaveDuplicates()
                    .allSatisfy(d -> assertThat(d.getYear()).isEqualTo(year));
        }
    }

    /** 표에 없는 해는 "공휴일 없음"이 아니라 "아직 모름"이다 — 앱이 둘을 가를 수 있어야 한다. */
    @Test
    void 표에_없는_해는_covered_false() {
        HolidayResponse r = catalog.of(2031);
        assertThat(r.covered()).isFalse();
        assertThat(r.holidays()).isEmpty();
        assertThat(catalog.of(2026).covered()).isTrue();
    }
}
