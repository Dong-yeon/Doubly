package com.fitto.calendar.dto;

import java.time.LocalDate;

/**
 * 커플 캘린더에 겹쳐 그리는 <b>다녀온 곳</b> — 커플 장소의 방문 한 건(같은 날·같은 장소는 한 줄).
 *
 * <p>이건 {@link EventResponse}(약속)와 성격이 다르다. 일정은 앞으로 있을 일이고 이건
 * 이미 있었던 일이라, {@code couple_events} 에 행을 만들지 않고 캘린더가 읽어 겹쳐 그린다
 * (여행 기간 띠와 같은 방식). 그래서 D-day 도 수정·삭제도 없다 — 고치려면 원본 방문·식단
 * 기록을 고치면 된다.
 *
 * <p>이름이 DateMeal 인 것은 처음엔 "장소가 붙은 같이 먹기 식단"만 실었기 때문이다.
 * 2026-10-02 부터 "다녀왔어요" 방문도 싣는다 — 앱이 같은 경로·필드를 읽으므로 이름은 둔다.
 *
 * @param mealId 연결된 식단 — 식단 없이 남긴 방문이면 null
 * @param visitId 방문 기록 — 같이 먹기 식단에 방문이 여럿 붙어도 대표 하나
 * @param visitedBy 한 사람만 다녀간 기록이면 그 사람, 둘이 함께(같이 먹기 식단이거나 둘 다
 *                  같은 날 그곳을 기록)면 null — 화면이 "누가 갔는지" 배지를 붙이는 근거
 * @param lovelichelinTier 럽슐랭 등급 (0=일반, 1~3=럽스타)
 */
public record DateMealResponse(
        LocalDate date,
        Long mealId,
        /** 무엇을 했는지 — 식단이면 음식(없으면 메모·끼니 이름), 식단 없는 방문이면 방문 메모 */
        String title,
        Long placeId,
        String placeName,
        Integer lovelichelinTier,
        String photoUrl,
        Long visitId,
        Long visitedBy
) {
}
