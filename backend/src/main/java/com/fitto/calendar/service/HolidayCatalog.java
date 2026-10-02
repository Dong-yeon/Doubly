package com.fitto.calendar.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.calendar.dto.HolidayResponse;
import com.fitto.calendar.dto.HolidayResponse.Holiday;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * 한국 관공서 공휴일 표 — {@code calendar/holidays-kr.json} 을 기동 때 한 번 읽는다.
 *
 * <p><b>왜 계산하지 않고 표로 두나.</b> 설날·추석·부처님오신날은 음력이고, 대체공휴일 규칙은
 * 종류마다 다르며(설·추석은 일요일만, 국경일·어린이날은 토요일도), 임시공휴일·선거일은 그때그때
 * 정해진다. 법도 바뀐다 — 2026년에만 노동절이 생기고 제헌절이 돌아왔다. 규칙으로 맞추면 언젠가 틀린
 * 빨간 날을 달력에 찍는다. 정부가 매년 발표하는 월력요항을 그대로 옮기는 편이 정확하다.
 *
 * <p><b>왜 앱이 아니라 서버에 두나.</b> 다음 해 표 추가·임시공휴일 지정은 서버 배포만으로 앱에
 * 닿는다 — 앱에 넣으면 그때마다 OTA 가 필요하다(스티커 팩을 서버로 옮긴 것과 같은 이유).
 *
 * <p>표가 깨져 있으면 기동에서 실패한다 — 조용히 빈 달력을 내리는 것보다 낫다. 표가 아예 없으면
 * (리소스 누락) 빈 표로 뜬다: 공휴일은 부가 정보라 서버 전체를 막을 일이 아니다.
 */
@Component
public class HolidayCatalog {

    static final String PATH = "calendar/holidays-kr.json";

    private final Map<Integer, List<Holiday>> byYear;

    public HolidayCatalog(ObjectMapper objectMapper) {
        this.byYear = load(objectMapper, new ClassPathResource(PATH));
    }

    /** 그 해의 공휴일 — 날짜순. 표에 없는 해는 covered=false 로 빈 목록. */
    public HolidayResponse of(int year) {
        List<Holiday> list = byYear.get(year);
        return list == null
                ? new HolidayResponse(year, false, List.of())
                : new HolidayResponse(year, true, list);
    }

    static Map<Integer, List<Holiday>> load(ObjectMapper objectMapper, ClassPathResource resource) {
        if (!resource.exists()) {
            return Map.of();
        }
        try (InputStream in = resource.getInputStream()) {
            JsonNode years = objectMapper.readTree(in).path("years");
            Map<Integer, List<Holiday>> result = new TreeMap<>();
            years.fields().forEachRemaining(entry -> {
                int year = Integer.parseInt(entry.getKey());
                List<Holiday> list = new ArrayList<>();
                for (JsonNode h : entry.getValue()) {
                    LocalDate date = LocalDate.parse(h.path("date").asText());
                    String name = h.path("name").asText();
                    if (date.getYear() != year || name.isBlank()) {
                        throw new IllegalStateException("공휴일 표가 잘못됐다: " + year + " " + h);
                    }
                    list.add(new Holiday(date, name));
                }
                list.sort(Comparator.comparing(Holiday::date));
                result.put(year, List.copyOf(list));
            });
            return result;
        } catch (IOException e) {
            throw new UncheckedIOException("공휴일 표를 읽지 못했다: " + PATH, e);
        }
    }
}
