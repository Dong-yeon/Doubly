package com.fitto.place.dto;

/**
 * AI 데이트 코스 선택 입력 — 전부 선택이다. 옛 앱은 아무것도 보내지 않으므로 {@link #defaults()} 가 예전 동작(밖에서·
 * 시간대·분위기 미지정·안 가본 곳 포함)과 같아야 한다. 설계: docs/LOVELICHELIN_AI_COURSE_2026-10-07.md.
 *
 * @param type             코스 유형 — 밖에서(장소만) / 영화·공연 / 집콕
 * @param timeSlot         시간대(없으면 지정 안 함)
 * @param mood             분위기(없으면 지정 안 함)
 * @param includeUnvisited 안 가본 곳(방문 기록 0건)도 후보로 둘지 — 끄면 다녀온 곳만으로 짠다
 */
public record DateCourseOptions(CourseType type, TimeSlot timeSlot, Mood mood, boolean includeUnvisited) {

    public enum CourseType {
        /** 밖에서 — 저장한 장소만(예전 코스) */
        OUTDOOR,
        /** 영화·공연 — 보고 싶은 콘텐츠 하나 + 저장 장소 1~2곳 */
        MOVIE_SHOW,
        /** 집콕 — 드라마·영화 + 포장해 올 저장 장소 0~1곳 */
        HOME
    }

    public enum TimeSlot { LUNCH, DINNER, DAY }

    public enum Mood { CALM, ACTIVE }

    public DateCourseOptions {
        if (type == null) type = CourseType.OUTDOOR;
    }

    public static DateCourseOptions defaults() {
        return new DateCourseOptions(CourseType.OUTDOOR, null, null, true);
    }

    /** 요청 파라미터(전부 선택) → 옵션. 모르는 값은 지정 안 함으로 본다 — 새 앱이 새 값을 보내도 옛 서버가 400 을 내지 않게 */
    public static DateCourseOptions parse(String type, String timeSlot, String mood, Boolean includeUnvisited) {
        return new DateCourseOptions(
                enumOrNull(CourseType.class, type),
                enumOrNull(TimeSlot.class, timeSlot),
                enumOrNull(Mood.class, mood),
                includeUnvisited == null || includeUnvisited);
    }

    private static <E extends Enum<E>> E enumOrNull(Class<E> cls, String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Enum.valueOf(cls, value.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
