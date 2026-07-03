package com.fitto.common.exception;

import org.springframework.http.HttpStatus;

/**
 * 도메인 에러 코드 — 설계서 4.1 (4xx 클라이언트 / 5xx 서버).
 */
public enum ErrorCode {

    // 공통
    INVALID_INPUT(HttpStatus.BAD_REQUEST, "잘못된 요청입니다."),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    FORBIDDEN(HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    NOT_FOUND(HttpStatus.NOT_FOUND, "리소스를 찾을 수 없습니다."),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "허용되지 않은 요청 방식입니다."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),

    // 인증 (AUTH)
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),

    // 관계 (RELATION) — 커플 / 트레이너-회원
    INVITE_CODE_EXPIRED(HttpStatus.BAD_REQUEST, "만료된 초대코드입니다."),
    INVITE_CODE_INVALID(HttpStatus.BAD_REQUEST, "유효하지 않은 초대코드입니다."),
    ALREADY_CONNECTED(HttpStatus.CONFLICT, "이미 연결된 관계입니다."),
    RELATION_NOT_FOUND(HttpStatus.NOT_FOUND, "관계를 찾을 수 없습니다."),

    // 트레이너 (TRAINER)
    NOT_A_TRAINER(HttpStatus.FORBIDDEN, "트레이너만 사용할 수 있는 기능입니다."),
    TRAINER_MEMBER_LIMIT(HttpStatus.CONFLICT, "회원 정원이 가득 찼습니다."),
    ALREADY_TRAINER(HttpStatus.CONFLICT, "이미 트레이너로 등록되어 있습니다."),
    TRAINER_NOT_ACCEPTING(HttpStatus.CONFLICT, "지금은 신규 회원을 받지 않는 트레이너입니다."),
    ROUTINE_NOT_FOUND(HttpStatus.NOT_FOUND, "루틴을 찾을 수 없습니다."),

    // 운동 (WORKOUT)
    WORKOUT_NOT_FOUND(HttpStatus.NOT_FOUND, "운동 기록을 찾을 수 없습니다."),

    // 맛집 지도 (PLACE)
    PLACE_NOT_FOUND(HttpStatus.NOT_FOUND, "장소를 찾을 수 없습니다."),

    // 식단 AI 분석 (DIET AI)
    AI_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "AI 분석 기능이 아직 준비되지 않았어요."),
    AI_DAILY_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "오늘의 AI 분석 횟수를 모두 사용했어요. 내일 다시 시도해주세요."),
    AI_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "지금은 AI 분석 요청이 많아요. 잠시 후 다시 시도해주세요."),
    AI_ANALYSIS_FAILED(HttpStatus.BAD_GATEWAY, "AI 분석에 실패했어요. 잠시 후 다시 시도해주세요."),
    INVALID_PHOTO_URL(HttpStatus.BAD_REQUEST, "지원하지 않는 사진 주소입니다.");

    private final HttpStatus status;
    private final String message;

    ErrorCode(HttpStatus status, String message) {
        this.status = status;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }
}
