package com.fitto.game.puzzle;

/**
 * 기보 문자열의 형식 검증 — {@code "ms,열,회전,축색,자식색,보낸방해,받은방해,아이템;..."}.
 *
 * <p><b>서버는 기보를 해석하지 않는다.</b> 엔진은 앱에 있고(§11-1), 서버가 착지의 의미까지
 * 알아야 할 이유가 없다. 캐치마인드 {@code Strokes} 와 같은 이유로 형식만 검사한다 —
 * 용량 상한과, 깨진 값이 상대 화면(고스트 재생)에서 터지는 것을 막기 위해서다.
 *
 * <p>경과 시간은 단조 증가해야 한다. 고스트 재생이 이 순서로 방해를 흘리므로 역행하면
 * 상대가 방해를 한꺼번에 받는다.
 *
 * <p>8번째 <b>아이템</b> 칸(§13)은 <b>선택</b>이다 — 아이템이 생기기 전에 시작된 판의 기보는
 * 7칸이고, 그걸 거절하면 진행 중이던 대전이 결과 제출에서 막힌다. 앱도 7·8 둘 다 읽는다.
 */
public final class Timeline {

    /** 약 40KB — 한 수 27자 × 1,000수 남짓. 실제 한 판은 100수 안팎이라 열 배 여유다 */
    public static final int MAX_LENGTH = 40_000;
    /** 한 수의 값 개수 — 아이템 칸이 없는 옛 기보(7)도 받는다 */
    public static final int FIELDS_PER_MOVE = 8;
    public static final int LEGACY_FIELDS_PER_MOVE = 7;
    /** 값 하나의 상한 자릿수 — 경과 ms 가 9자리면 11일이다 */
    private static final int MAX_DIGITS = 9;

    private Timeline() {
    }

    /** 형식이 맞으면 true. 빈 기보(한 수도 못 두고 끝난 판)도 허용한다. */
    public static boolean isValid(String timeline) {
        if (timeline == null || timeline.isEmpty()) return true;
        if (timeline.length() > MAX_LENGTH) return false;

        long previousMs = -1;
        for (String move : timeline.split(";", -1)) {
            String[] parts = move.split(",", -1);
            if (parts.length != FIELDS_PER_MOVE && parts.length != LEGACY_FIELDS_PER_MOVE) return false;
            for (String part : parts) {
                if (!isBoundedInt(part)) return false;
            }
            long ms = Long.parseLong(parts[0]);
            if (ms < previousMs) return false;
            previousMs = ms;
        }
        return true;
    }

    private static boolean isBoundedInt(String value) {
        if (value.isEmpty() || value.length() > MAX_DIGITS) return false;
        for (int i = 0; i < value.length(); i++) {
            if (!Character.isDigit(value.charAt(i))) return false;
        }
        return true;
    }
}
