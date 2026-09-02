package com.fitto.workout.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * 둘의 이번 주(월~일) 운동 완료 날짜 — 운동 홈 상단 "이번 주 한눈에 보기"에서 나란히 보여준다.
 *
 * <p>조사에서 커플 운동 앱의 핵심으로 꼽힌 건 "기록 공유"가 아니라 "같이 나타났다는
 * 증거"였다(docs/WORKOUT_UX_ANALYSIS_2026-09-01.md 5순위). 각자 완료한 날짜만 따로
 * 내려주고 화면에서 요일별로 겹쳐 그린다 — 서버가 굳이 "누구는 했는데 누구는 안 했다"를
 * 판정할 필요는 없고, 그 판정(빈칸이 보인다는 것 자체가 신호다)은 화면의 몫이다.
 */
public record CoupleWeekResponse(boolean connected, String partnerName,
                                  List<LocalDate> myDates, List<LocalDate> partnerDates) {

    public static CoupleWeekResponse notConnected() {
        return new CoupleWeekResponse(false, null, List.of(), List.of());
    }
}
