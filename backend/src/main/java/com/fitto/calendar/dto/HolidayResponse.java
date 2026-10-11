package com.fitto.calendar.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 한 해의 관공서 공휴일(일요일 제외).
 *
 * @param covered 이 해의 표를 서버가 갖고 있는가 — false 면 holidays 가 비어 있어도 "공휴일이 없다"가
 *                아니라 "아직 모른다"이다(다음 해 월력요항은 6월 말에 나온다)
 */
public record HolidayResponse(int year, boolean covered, List<Holiday> holidays) {

    public record Holiday(LocalDate date, String name) {
    }
}
