package com.fitto.place.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.place.dto.DateCourseOptions;
import com.fitto.place.dto.DateCourseResponse.Stop;
import com.fitto.place.service.DateCourseInput.PlaceCandidate;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** AI 데이트 코스 입력 만들기·출력 읽기 — Gemini 없이(docs/LOVELICHELIN_AI_COURSE_2026-10-07.md) */
class DateCourseInputTest {

    private final ObjectMapper om = new ObjectMapper();

    // 마포 일대 실제 좌표 근처 — 을밀대(염리동)·연남동·서교동, 강남은 멀리
    private static PlaceCandidate place(long id, String name, long visits, Integer mine, Integer partner,
                                       Double lat, Double lng) {
        return new PlaceCandidate(id, name, "음식점", null, "서울 마포구", lat, lng, visits,
                visits > 0 ? LocalDate.of(2026, 9, 20) : null, mine, partner, 0);
    }

    private final PlaceCandidate eulmildae = place(1, "을밀대", 3, 5, 4, 37.5469, 126.9452);
    private final PlaceCandidate yeonnam = place(2, "연남 카페", 0, null, null, 37.5622, 126.9254);
    private final PlaceCandidate jinjin = place(3, "진진", 1, 5, 2, 37.5539, 126.9178);
    private final PlaceCandidate gangnam = place(4, "강남 파스타", 1, 4, 4, 37.4979, 127.0276);
    private final PlaceCandidate noCoords = place(5, "동네 국숫집", 0, null, null, null, null);
    private final PlaceCandidate soloLow = place(6, "혼자 별로", 1, 1, null, 37.55, 126.92);

    @Test
    void 둘_중_한_명이라도_2점_이하면_후보에서_뺀다() {
        List<PlaceCandidate> kept = DateCourseInput.filterPlaces(
                List.of(eulmildae, yeonnam, jinjin, gangnam, noCoords, soloLow), true);
        assertThat(kept).extracting(PlaceCandidate::name)
                .containsExactly("을밀대", "연남 카페", "강남 파스타", "동네 국숫집");
        // 프롬프트에도 안 실린다
        String prompt = DateCourseInput.prompt(DateCourseOptions.defaults(), kept);
        assertThat(prompt).doesNotContain("진진").doesNotContain("혼자 별로");
    }

    @Test
    void 안_가본_곳_포함을_끄면_다녀온_곳만_남는다() {
        List<PlaceCandidate> kept = DateCourseInput.filterPlaces(List.of(eulmildae, yeonnam, gangnam, noCoords), false);
        assertThat(kept).extracting(PlaceCandidate::name).containsExactly("을밀대", "강남 파스타");
    }

    @Test
    void 안_가본_곳이_있으면_최소_1곳_규칙이_붙고_없거나_끄면_안_붙는다() {
        String with = DateCourseInput.prompt(DateCourseOptions.defaults(), List.of(eulmildae, yeonnam));
        assertThat(with).contains("'아직 안 가봄'인 곳을 최소 1곳");

        String allVisited = DateCourseInput.prompt(DateCourseOptions.defaults(), List.of(eulmildae, gangnam));
        assertThat(allVisited).doesNotContain("최소 1곳");

        DateCourseOptions off = new DateCourseOptions(DateCourseOptions.CourseType.OUTDOOR, null, null, false);
        assertThat(DateCourseInput.prompt(off, List.of(eulmildae, yeonnam))).doesNotContain("최소 1곳");
    }

    @Test
    void 입력에_id_방문_평점_가까운_곳이_실린다() {
        String prompt = DateCourseInput.prompt(DateCourseOptions.defaults(), List.of(eulmildae, yeonnam, gangnam, noCoords));
        assertThat(prompt)
                .contains("- P1 을밀대")
                .contains("다녀옴 3회, 마지막 2026-09-20")
                .contains("평점 나 5/상대 4")
                .contains("- P2 연남 카페").contains("아직 안 가봄")
                .contains("- P5 동네 국숫집").contains("위치 정보 없음");
        // 을밀대에서 가장 가까운 곳은 연남 카페(약 2.5km) — 강남보다 먼저 나온다
        String eulLine = prompt.lines().filter(l -> l.startsWith("- P1 ")).findFirst().orElseThrow();
        assertThat(eulLine).contains("가까운 곳: P2 ");
        assertThat(eulLine.indexOf("P2 ")).isLessThan(eulLine.indexOf("P4 "));
    }

    @Test
    void 시간대_분위기_규칙이_붙는다() {
        DateCourseOptions o = new DateCourseOptions(DateCourseOptions.CourseType.OUTDOOR,
                DateCourseOptions.TimeSlot.DINNER, DateCourseOptions.Mood.CALM, true);
        assertThat(DateCourseInput.prompt(o, List.of(eulmildae, gangnam)))
                .contains("저녁 식사를 중심으로").contains("조용히 이야기");
    }

    @Test
    void 출력은_ref_로_찾고_모르는_ref_중복은_버리며_이름은_우리_기록에서_채운다() throws Exception {
        // 이름이 같은 두 장소 — 이름으로는 가를 수 없다
        PlaceCandidate dupA = place(10, "스타벅스", 1, 4, 4, 37.5470, 126.9450);
        PlaceCandidate dupB = place(11, "스타벅스", 0, null, null, 37.4980, 127.0270);
        var byRef = DateCourseInput.byRef(List.of(eulmildae, dupA, dupB));
        var result = om.readTree("""
                {"stops":[
                  {"ref":"P1","reason":"점심"},
                  {"ref":"p11","reason":"강남 쪽 스타벅스"},
                  {"ref":"P99","reason":"없는 곳"},
                  {"ref":"P1","reason":"중복"},
                  {"ref":"[P10]","reason":"근처 스타벅스"}
                ],"comment":"좋은 하루"}""");

        List<Stop> stops = DateCourseInput.toStops(result, byRef);

        assertThat(stops).extracting(Stop::id).containsExactly(1L, 11L, 10L);
        assertThat(stops).extracting(Stop::kind).containsOnly("PLACE");
        assertThat(stops.get(0).name()).isEqualTo("을밀대");
        assertThat(stops.get(1).reason()).isEqualTo("강남 쪽 스타벅스");
    }

    @Test
    void 다음_장소까지_거리는_서버가_좌표로_넣는다() throws Exception {
        var byRef = DateCourseInput.byRef(List.of(eulmildae, yeonnam, noCoords));
        var result = om.readTree("""
                {"stops":[{"ref":"P1","reason":"a"},{"ref":"P2","reason":"b"},{"ref":"P5","reason":"c"}]}""");

        List<Stop> stops = DateCourseInput.toStops(result, byRef);

        // 을밀대 → 연남 카페 직선 약 2.5km
        assertThat(stops.get(0).nextDistanceKm()).isBetween(2.0, 3.0);
        // 다음 장소(동네 국숫집)에 좌표가 없으면 비운다, 마지막도 비운다
        assertThat(stops.get(1).nextDistanceKm()).isNull();
        assertThat(stops.get(2).nextDistanceKm()).isNull();
    }

    @Test
    void 옵션_파싱은_모르는_값을_지정_안_함으로_본다() {
        DateCourseOptions o = DateCourseOptions.parse("weird", "dinner", null, null);
        assertThat(o.type()).isEqualTo(DateCourseOptions.CourseType.OUTDOOR);
        assertThat(o.timeSlot()).isEqualTo(DateCourseOptions.TimeSlot.DINNER);
        assertThat(o.mood()).isNull();
        assertThat(o.includeUnvisited()).isTrue();
    }
}
