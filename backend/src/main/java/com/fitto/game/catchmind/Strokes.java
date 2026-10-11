package com.fitto.game.catchmind;

/**
 * 그림 문자열의 형식 검증 — {@code "색,굵기,x1,y1,x2,y2;색,굵기,..."}.
 *
 * <p><b>서버는 그림을 해석하지 않는다.</b> 그릴 줄 아는 건 앱이고, 서버가 좌표의 의미까지
 * 알아야 할 이유가 없다. 그래도 형식은 검사한다 — 두 가지를 막기 위해서다.
 * <ol>
 *   <li><b>용량.</b> 상한이 없으면 한 판이 DB 를 수 MB 씩 먹는다(지우개로 덧칠하면 획은
 *       계속 쌓인다). {@link #MAX_LENGTH} 에서 끊는다.</li>
 *   <li><b>렌더 실패.</b> 값이 홀수 개면 상대 화면에서 그림이 깨진다 — 보낸 사람은
 *       멀쩡히 그렸는데 상대만 못 보는 상태가 되고, 원인을 아무도 모른다.</li>
 * </ol>
 */
public final class Strokes {

    /**
     * 약 60KB. 한 획 50점 × 20획이면 8KB 남짓이라 평범한 그림의 대여섯 배 여유다.
     * 넘으면 앱이 먼저 막고(획 수 제한), 여기는 마지막 방어선이다.
     */
    public static final int MAX_LENGTH = 60_000;
    /** 좌표계 — 0~1000 정규화라 어떤 화면 크기에서도 같은 그림이 된다 */
    public static final int COORD_MAX = 1000;
    /** 한 획의 최소 값 개수: 색·굵기 + 점 하나(x,y) */
    private static final int MIN_VALUES_PER_STROKE = 4;

    private Strokes() {
    }

    /** 형식이 맞으면 true. 빈 그림도 거절한다(그리지 않고 보낼 수는 없다). */
    public static boolean isValid(String strokes) {
        if (strokes == null || strokes.isBlank() || strokes.length() > MAX_LENGTH) return false;

        for (String stroke : strokes.split(";", -1)) {
            String[] parts = stroke.split(",", -1);
            if (parts.length < MIN_VALUES_PER_STROKE) return false;
            // 색·굵기를 뺀 나머지가 (x, y) 쌍이어야 한다
            if ((parts.length - 2) % 2 != 0) return false;
            for (String part : parts) {
                if (!isBoundedInt(part)) return false;
            }
        }
        return true;
    }

    private static boolean isBoundedInt(String value) {
        if (value.isEmpty() || value.length() > 4) return false;
        for (int i = 0; i < value.length(); i++) {
            if (!Character.isDigit(value.charAt(i))) return false;
        }
        return Integer.parseInt(value) <= COORD_MAX;
    }
}
