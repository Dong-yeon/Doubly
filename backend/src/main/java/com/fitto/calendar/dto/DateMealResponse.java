package com.fitto.calendar.dto;

import java.time.LocalDate;

/**
 * 커플 캘린더에 겹쳐 그리는 <b>데이트 기록</b> — 장소가 연결된 데이트 식단 한 건.
 *
 * <p>이건 {@link EventResponse}(약속)와 성격이 다르다. 일정은 앞으로 있을 일이고 이건
 * 이미 있었던 일이라, {@code couple_events} 에 행을 만들지 않고 캘린더가 읽어 겹쳐 그린다
 * (여행 기간 띠와 같은 방식). 그래서 D-day 도 수정·삭제도 없다 — 고치려면 원본 식단
 * 기록을 고치면 된다.
 *
 * @param placeName 연결된 장소 — 이 값이 있는 기록만 내려온다({@code DateMealCalendarService} 참고)
 * @param lovelichelinTier 럽슐랭 등급 (0=일반, 1~3=럽스타)
 */
public record DateMealResponse(
        LocalDate date,
        Long mealId,
        /** 무엇을 먹었는지 — 음식 항목이 없으면 메모, 그마저 없으면 끼니 이름 */
        String title,
        Long placeId,
        String placeName,
        Integer lovelichelinTier,
        String photoUrl
) {
}
