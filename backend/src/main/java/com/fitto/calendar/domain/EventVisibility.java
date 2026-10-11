package com.fitto.calendar.domain;

/**
 * 일정의 공개 범위 — 누구의 일정이고 누가 보는가.
 *
 * <p>같은 달력에 "우리 일정"과 "각자의 일정"이 함께 놓인다. 캘린더가 기념일 보관함을
 * 넘어 실제로 쓰이려면 회식·야근·병원 같은 각자의 일정도 들어갈 자리가 있어야 한다.
 *
 * <p>{@link #PERSONAL} 과 {@link #PRIVATE} 을 가른 이유: 내 일정의 값어치는 대개
 * <b>상대가 내가 바쁜 날을 아는 것</b>에 있다. 그래서 기본은 보이게 두고, 숨기고 싶은
 * 날(선물 준비 같은 것)만 따로 고르게 한다.
 *
 * <p>알림은 <b>주인에게만</b> 간다(SHARED 만 양쪽). 상대의 회식을 내 폰이 아침마다
 * 알려주면 그건 소음이다.
 */
public enum EventVisibility {

    /** 우리 일정 — 둘 다 보고, 둘 다 알림을 받는다. 지금까지의 모든 일정이 이것이다. */
    SHARED,

    /** 내 일정 — 상대도 보지만(누구 일정인지 표시된다) 알림은 나만 받는다. */
    PERSONAL,

    /** 나만 보기 — 상대에게 보이지 않는다. 조회·수정·삭제 모두 만든 사람만. */
    PRIVATE;

    /** 상대에게 감추는가 — 목록·알림 어디에도 나타나지 않아야 한다. */
    public boolean hiddenFromPartner() {
        return this == PRIVATE;
    }

    /** 둘의 일정인가 — 알림 대상과 수정 권한이 여기서 갈린다. */
    public boolean isShared() {
        return this == SHARED;
    }
}
