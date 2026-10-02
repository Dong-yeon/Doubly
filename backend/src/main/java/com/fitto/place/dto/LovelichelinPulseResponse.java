package com.fitto.place.dto;

/**
 * 홈 이름 옆 럽슐랭 왕관 신호 — GET /places/lovelichelin/pulse. 사람마다 하나, 없으면 null.
 * 규칙은 {@link com.fitto.place.service.LovelichelinPulseService}.
 */
public record LovelichelinPulseResponse(Signal me, Signal partner) {

    public enum State {
        /** 그 사람이 관여한 장소·콘텐츠가 최근 24시간 안에 등극했다 — 앱이 처음 볼 때 한 번 반짝인다 */
        CERTIFIED,
        /** 그 사람이 오늘(KST) 럽슐랭에 방문·관람 기록이나 대표 평점을 남겼다 — 정지 상태 */
        TODAY
    }

    public enum Kind { PLACE, CONTENT }

    /**
     * @param targetId         누르면 갈 장소·콘텐츠 id
     * @param tier             CERTIFIED 일 때 등급(1~3), TODAY 면 지금 등급(0 이면 미인증)
     * @param certificationKey CERTIFIED 일 때만 — "본 등극"을 기기에 기억하는 열쇠. 탈락 후 재등극하면 바뀐다
     * @param viewerRated      보는 사람(나)이 그 대상에 대표 평점을 남겼는가 — 상대 왕관을 눌러 들어갈 때
     *                         평가 영역을 열어 둘지 정한다
     */
    public record Signal(State state, Kind kind, Long targetId, String targetName, int tier,
                         String certificationKey, boolean viewerRated) {
    }

    public static LovelichelinPulseResponse none() {
        return new LovelichelinPulseResponse(null, null);
    }
}
