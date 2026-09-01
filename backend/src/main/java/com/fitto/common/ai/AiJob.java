package com.fitto.common.ai;

/**
 * 백그라운드 AI 작업의 한 상태 스냅샷 — {@link AiJobService} 가 저장하고 앱이 폴링해 읽는다.
 *
 * <p>{@code resultJson} 을 문자열로 들고 있는 이유: 작업마다 결과 타입이 다른데
 * (여행 일정은 {@code List<TripDayResponse>}, 주간 레터는 {@code WeeklyLetterResponse}),
 * 저장소는 Redis 문자열 하나뿐이다. 타입은 만든 쪽만 알면 되고, 앱은 그대로 받아 쓴다.
 *
 * @param userId    소유자 — 남의 작업 결과를 훔쳐보지 못하게 폴링 때 대조한다
 * @param status    진행 상태
 * @param resultJson 성공 시 결과 JSON (그 외에는 null)
 * @param errorCode  실패 시 {@link com.fitto.common.exception.ErrorCode} 이름
 * @param message    실패 시 사용자에게 보여줄 한국어 메시지
 */
public record AiJob(
        Long userId,
        Status status,
        String resultJson,
        String errorCode,
        String message
) {

    public enum Status { PENDING, DONE, FAILED }

    public static AiJob pending(Long userId) {
        return new AiJob(userId, Status.PENDING, null, null, null);
    }

    public AiJob done(String resultJson) {
        return new AiJob(userId, Status.DONE, resultJson, null, null);
    }

    public AiJob failed(String errorCode, String message) {
        return new AiJob(userId, Status.FAILED, null, errorCode, message);
    }
}
