package com.fitto.place.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.place.dto.DateCourseOptions;
import com.fitto.place.dto.DateCourseResponse.Stop;
import com.fitto.place.service.DateCourseInput.ContentCandidate;
import com.fitto.place.service.DateCourseInput.PlaceCandidate;
import com.fitto.content.service.TmdbClient.NowPlaying;
import com.fitto.place.dto.DateCourseOptions.CourseType;
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

    // ---------------------------------------------------------------- 2단계: 콘텐츠

    private static ContentCandidate content(long id, String title, String type, long logs,
                                            Integer mine, Integer partner, boolean showing) {
        return new ContentCandidate(id, title, type, "https://image.tmdb.org/p/" + id + ".jpg", logs, mine, partner, 0, showing);
    }

    private final List<NowPlaying> nowPlaying = List.of(
            new NowPlaying("듄: 파트2", "Dune: Part Two"),
            new NowPlaying("베테랑2", "베테랑2"));

    @Test
    void 상영작_대조는_정확히_같을_때만_상영_중이고_부분_일치는_애매로_본다() {
        assertThat(DateCourseInput.screening("듄 파트2", nowPlaying)).isEqualTo(DateCourseInput.Screening.SHOWING);
        assertThat(DateCourseInput.screening("Dune: Part Two", nowPlaying)).isEqualTo(DateCourseInput.Screening.SHOWING);
        // "듄"은 "듄: 파트2"의 일부 — 1편인지 2편인지 모른다
        assertThat(DateCourseInput.screening("듄", nowPlaying)).isEqualTo(DateCourseInput.Screening.NOT_SHOWING);
        assertThat(DateCourseInput.screening("베테랑", nowPlaying)).isEqualTo(DateCourseInput.Screening.AMBIGUOUS);
        assertThat(DateCourseInput.screening("인사이드 아웃", nowPlaying)).isEqualTo(DateCourseInput.Screening.NOT_SHOWING);
        assertThat(DateCourseInput.screening("듄 파트2", List.of())).isEqualTo(DateCourseInput.Screening.NOT_SHOWING);
    }

    @Test
    void 영화_공연_코스는_안_본_공연과_상영_중인_영화만() {
        List<ContentCandidate> all = List.of(
                content(1, "듄: 파트2", "MOVIE", 0, null, null, true),
                content(2, "옛날 영화", "MOVIE", 0, null, null, false),
                content(3, "레미제라블", "PERFORMANCE", 0, null, null, false),
                content(4, "본 공연", "PERFORMANCE", 1, 5, 5, false),
                content(5, "드라마", "DRAMA", 0, null, null, false),
                content(6, "별로인 공연", "PERFORMANCE", 0, 2, null, false));

        assertThat(DateCourseInput.filterContents(all, CourseType.MOVIE_SHOW))
                .extracting(ContentCandidate::title).containsExactly("듄: 파트2", "레미제라블");
        // 집콕: 드라마·영화(상영 무관), 본 것도 남긴다
        assertThat(DateCourseInput.filterContents(all, CourseType.HOME))
                .extracting(ContentCandidate::title).containsExactly("듄: 파트2", "옛날 영화", "드라마");
        assertThat(DateCourseInput.filterContents(all, CourseType.OUTDOOR)).isEmpty();
    }

    @Test
    void 집콕_장소는_음식점_카페만() {
        PlaceCandidate cafe = new PlaceCandidate(7L, "카페", "카페·디저트", null, null, null, null, 0, null, null, null, 0);
        PlaceCandidate museum = new PlaceCandidate(8L, "미술관", "박물관·전시", null, null, null, null, 0, null, null, null, 0);
        DateCourseOptions home = new DateCourseOptions(CourseType.HOME, null, null, true);
        assertThat(DateCourseInput.filterPlaces(List.of(eulmildae, cafe, museum), home))
                .extracting(PlaceCandidate::name).containsExactly("을밀대", "카페");
    }

    @Test
    void 콘텐츠_stop_은_kind_id_포스터를_싣고_영화_공연은_콘텐츠_1개_장소_2곳까지() throws Exception {
        ContentCandidate dune = content(1, "듄: 파트2", "MOVIE", 0, null, null, true);
        ContentCandidate musical = content(3, "레미제라블", "PERFORMANCE", 0, null, null, false);
        var result = om.readTree("""
                {"stops":[
                  {"ref":"P1","reason":"먼저 냉면"},
                  {"ref":"C1","reason":"영화"},
                  {"ref":"C3","reason":"두 번째 작품은 넘친다"},
                  {"ref":"P2","reason":"카페"},
                  {"ref":"P4","reason":"세 번째 장소는 넘친다"}
                ]}""");

        List<Stop> stops = DateCourseInput.toStops(result,
                DateCourseInput.byRef(List.of(eulmildae, yeonnam, gangnam)),
                DateCourseInput.contentsByRef(List.of(dune, musical)), CourseType.MOVIE_SHOW);

        assertThat(stops).extracting(Stop::kind).containsExactly("PLACE", "CONTENT", "PLACE");
        assertThat(stops).extracting(Stop::id).containsExactly(1L, 1L, 2L);
        Stop movie = stops.get(1);
        assertThat(movie.name()).isEqualTo("듄: 파트2");
        assertThat(movie.posterUrl()).isEqualTo("https://image.tmdb.org/p/1.jpg");
        assertThat(movie.contentType()).isEqualTo("MOVIE");
        assertThat(movie.category()).isEqualTo("영화");
        // 사이에 콘텐츠가 끼면 장소 사이 거리를 넣지 않는다(극장 위치를 모른다)
        assertThat(stops.get(0).nextDistanceKm()).isNull();
    }

    @Test
    void 장소_P1_과_콘텐츠_C1_은_id_가_같아도_섞이지_않는다() throws Exception {
        ContentCandidate c1 = content(1, "같은 번호 작품", "DRAMA", 0, null, null, false);
        var result = om.readTree("""
                {"stops":[{"ref":"C1","reason":"보기"},{"ref":"P1","reason":"포장"}]}""");
        List<Stop> stops = DateCourseInput.toStops(result, DateCourseInput.byRef(List.of(eulmildae)),
                DateCourseInput.contentsByRef(List.of(c1)), CourseType.HOME);
        assertThat(stops).extracting(Stop::name).containsExactly("같은 번호 작품", "을밀대");
    }

    @Test
    void 코스_유형별_프롬프트에_콘텐츠_목록과_개수_규칙이_실린다() {
        ContentCandidate dune = content(1, "듄: 파트2", "MOVIE", 0, 5, null, true);
        String movie = DateCourseInput.prompt(new DateCourseOptions(CourseType.MOVIE_SHOW, null, null, true),
                List.of(eulmildae), List.of(dune));
        assertThat(movie).contains("콘텐츠(C) 정확히 1개").contains("[콘텐츠]")
                .contains("- C1 듄: 파트2 [영화] · 아직 안 봄 · 평점 나 5/상대 - · 지금 상영 중")
                .contains("[저장된 장소]");

        String home = DateCourseInput.prompt(new DateCourseOptions(CourseType.HOME, null, null, true),
                List.of(), List.of(content(5, "드라마", "DRAMA", 0, null, null, false)));
        assertThat(home).contains("포장해 올 장소(P) 0~1곳").doesNotContain("[저장된 장소]").doesNotContain("동선:");
    }

    @Test
    void 재료가_모자라면_한도를_쓰지_않고_이유를_말한다() {
        DateCourseOptions movie = new DateCourseOptions(CourseType.MOVIE_SHOW, null, null, true);
        assertThat(DateCourseService.shortage(movie, List.of(eulmildae), List.of()).comment()).contains("상영 중인 영화");
        assertThat(DateCourseService.shortage(movie, List.of(),
                List.of(content(1, "듄", "MOVIE", 0, null, null, true))).comment()).contains("들를 장소");
        assertThat(DateCourseService.shortage(new DateCourseOptions(CourseType.HOME, null, null, true),
                List.of(), List.of(content(5, "드라마", "DRAMA", 0, null, null, false)))).isNull();
        assertThat(DateCourseService.shortage(DateCourseOptions.defaults(), List.of(eulmildae), List.of())).isNotNull();
    }
}
