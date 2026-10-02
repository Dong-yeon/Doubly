package com.fitto.calendar.controller;

import com.fitto.calendar.dto.HolidayResponse;
import com.fitto.calendar.service.HolidayCatalog;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.time.KstClock;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 한국 공휴일 — 커플 캘린더가 빨간 날을 칠할 때 쓴다. 사용자와 무관한 공용 데이터다. */
@RestController
@RequestMapping("/api/v1/calendar/holidays")
public class HolidayController {

    private final HolidayCatalog holidayCatalog;

    public HolidayController(HolidayCatalog holidayCatalog) {
        this.holidayCatalog = holidayCatalog;
    }

    /** 한 해의 공휴일 — 파라미터 생략 시 올해(KST). */
    @GetMapping
    public ApiResponse<HolidayResponse> year(@RequestParam(required = false) Integer year) {
        return ApiResponse.success(holidayCatalog.of(year != null ? year : KstClock.today().getYear()));
    }
}
