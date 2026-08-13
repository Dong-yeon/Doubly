package com.fitto.common.plan;

import java.time.LocalDate;
import java.time.temporal.WeekFields;

/**
 * 한 기능 · 한 플랜의 이용 한도.
 *
 * <p>세 가지 모양만 있다.
 * <ul>
 *   <li>{@link #blocked()} — 그 플랜에서는 아예 못 쓴다 (업그레이드 유도)</li>
 *   <li>{@link #unlimited()} — 한도 없음</li>
 *   <li>기간/총량 한도 — 하루 N회, 한 달 N회, 총 N개</li>
 * </ul>
 *
 * @param window 한도가 리셋되는 주기. {@link Window#TOTAL} 은 리셋되지 않는 보유 개수 상한
 * @param limit  허용 횟수. {@link #UNLIMITED} 는 무제한, 0 은 차단
 */
public record Quota(Window window, int limit) {

    public static final int UNLIMITED = -1;

    /** 한도가 리셋되는 주기. */
    public enum Window {
        /** 매일 자정(KST) 리셋 — AI 호출처럼 반복 소비되는 것 */
        DAY,
        /** 매주 리셋 */
        WEEK,
        /** 매월 1일 리셋 — 사진 업로드처럼 월 단위가 자연스러운 것 */
        MONTH,
        /** 리셋 없음. "동시에 몇 개까지 가질 수 있나"(여행·맛집핀·루틴) — 카운터가 아니라 DB 개수로 판정 */
        TOTAL,
        /** 차단·무제한 — 셀 필요가 없음 */
        NONE
    }

    public static Quota blocked() {
        return new Quota(Window.NONE, 0);
    }

    public static Quota unlimited() {
        return new Quota(Window.NONE, UNLIMITED);
    }

    public static Quota perDay(int limit) {
        return new Quota(Window.DAY, limit);
    }

    public static Quota perWeek(int limit) {
        return new Quota(Window.WEEK, limit);
    }

    public static Quota perMonth(int limit) {
        return new Quota(Window.MONTH, limit);
    }

    /** 보유 개수 상한 — 지우면 다시 만들 수 있다. */
    public static Quota upTo(int limit) {
        return new Quota(Window.TOTAL, limit);
    }

    public boolean isBlocked() {
        return limit == 0;
    }

    public boolean isUnlimited() {
        return limit == UNLIMITED;
    }

    /** 카운터(Redis)로 세는 한도인가 — TOTAL 은 DB 개수로 판정하므로 제외한다. */
    public boolean isCounted() {
        return window == Window.DAY || window == Window.WEEK || window == Window.MONTH;
    }

    /**
     * 카운터 키에 들어갈 기간 식별자.
     *
     * <p>기준 시각은 <b>KST</b> 다. 서버(Railway)가 UTC 로 돌기 때문에 {@code LocalDate.now()}
     * 를 쓰면 한도가 <b>한국 시간 오전 9시</b>에 리셋된다 — 사용자에게는 "오늘"이 아니다.
     */
    public String windowKey(LocalDate todayInKst) {
        return switch (window) {
            case DAY -> todayInKst.toString();
            case WEEK -> {
                WeekFields weekFields = WeekFields.ISO;
                yield "%d-W%02d".formatted(
                        todayInKst.get(weekFields.weekBasedYear()),
                        todayInKst.get(weekFields.weekOfWeekBasedYear()));
            }
            case MONTH -> "%d-%02d".formatted(todayInKst.getYear(), todayInKst.getMonthValue());
            case TOTAL, NONE -> "-";
        };
    }
}
