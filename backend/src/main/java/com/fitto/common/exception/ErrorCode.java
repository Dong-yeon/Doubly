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
    TOO_MANY_REQUESTS(HttpStatus.TOO_MANY_REQUESTS, "요청이 너무 많습니다. 잠시 후 다시 시도해주세요."),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류가 발생했습니다."),

    // 인증 (AUTH)
    EMAIL_ALREADY_EXISTS(HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),
    // 비밀번호 재설정 (AUTH-07) — 코드 오류/만료를 한 코드로 묶어 유효한 코드 탐색 단서를 주지 않는다
    INVALID_RESET_CODE(HttpStatus.BAD_REQUEST, "인증코드가 올바르지 않거나 만료되었습니다."),
    RESET_CODE_ATTEMPTS_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "인증코드를 5회 이상 틀렸습니다. 코드를 다시 발급받아주세요."),
    SAME_AS_CURRENT_PASSWORD(HttpStatus.BAD_REQUEST, "현재 비밀번호와 다른 비밀번호를 입력해주세요."),
    PASSWORD_NOT_SET(HttpStatus.BAD_REQUEST, "소셜 로그인 계정은 비밀번호를 사용하지 않습니다."),

    // 관계 (RELATION) — 커플 / 트레이너-회원
    INVITE_CODE_EXPIRED(HttpStatus.BAD_REQUEST, "만료된 초대코드입니다."),
    INVITE_CODE_INVALID(HttpStatus.BAD_REQUEST, "유효하지 않은 초대코드입니다."),
    ALREADY_CONNECTED(HttpStatus.CONFLICT, "이미 연결된 관계입니다."),
    RELATION_NOT_FOUND(HttpStatus.NOT_FOUND, "관계를 찾을 수 없습니다."),
    // 연결이 끊긴 뒤의 접근 — 상대가 종료된 관계로 계속 메시지를 보내는 것을 막는다
    RELATION_NOT_ACTIVE(HttpStatus.FORBIDDEN, "연결이 끊긴 관계입니다."),
    // 기록 완전 삭제는 연결을 끊은 뒤에만 — 사용 중인 기록을 실수로 지우는 것을 막는다
    RELATION_STILL_ACTIVE(HttpStatus.CONFLICT, "연결을 먼저 끊어야 기록을 삭제할 수 있습니다."),
    NO_RECORDS_TO_RESTORE(HttpStatus.NOT_FOUND, "불러올 지난 기록이 없습니다."),

    // 가족 (FAMILY) — N인 관계 (README "관계 모델")
    FAMILY_NOT_FOUND(HttpStatus.NOT_FOUND, "가족을 찾을 수 없습니다."),
    FAMILY_ALREADY_JOINED(HttpStatus.CONFLICT, "이미 가족에 속해 있습니다."),
    FAMILY_MEMBER_LIMIT(HttpStatus.CONFLICT, "가족 인원이 가득 찼습니다."),
    NOT_A_GUARDIAN(HttpStatus.FORBIDDEN, "보호자만 할 수 있는 작업입니다."),

    // 트레이너 (TRAINER)
    NOT_A_TRAINER(HttpStatus.FORBIDDEN, "트레이너만 사용할 수 있는 기능입니다."),
    TRAINER_MEMBER_LIMIT(HttpStatus.CONFLICT, "회원 정원이 가득 찼습니다."),
    ALREADY_TRAINER(HttpStatus.CONFLICT, "이미 트레이너로 등록되어 있습니다."),
    TRAINER_NOT_ACCEPTING(HttpStatus.CONFLICT, "지금은 신규 회원을 받지 않는 트레이너입니다."),
    ROUTINE_NOT_FOUND(HttpStatus.NOT_FOUND, "루틴을 찾을 수 없습니다."),

    // 운동 (WORKOUT)
    WORKOUT_NOT_FOUND(HttpStatus.NOT_FOUND, "운동 기록을 찾을 수 없습니다."),

    // 커플 루틴 선물 (ROUTINE GIFT)
    GIFT_NOT_FOUND(HttpStatus.NOT_FOUND, "선물을 찾을 수 없습니다."),
    GIFT_ALREADY_RESPONDED(HttpStatus.CONFLICT, "이미 응답한 선물이에요."),

    // 맛집 지도 (PLACE)
    PLACE_NOT_FOUND(HttpStatus.NOT_FOUND, "장소를 찾을 수 없습니다."),

    // 일상 피드 (FEED)
    FEED_POST_NOT_FOUND(HttpStatus.NOT_FOUND, "포스트를 찾을 수 없습니다."),

    // 여행 (TRIP)
    TRIP_NOT_FOUND(HttpStatus.NOT_FOUND, "여행을 찾을 수 없습니다."),
    TRIP_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "일정 항목을 찾을 수 없습니다."),
    TRIP_EXPENSE_NOT_FOUND(HttpStatus.NOT_FOUND, "경비 항목을 찾을 수 없습니다."),
    TRIP_CHECKLIST_ITEM_NOT_FOUND(HttpStatus.NOT_FOUND, "준비물 항목을 찾을 수 없습니다."),

    // 이미지 업로드 (UPLOAD)
    UPLOAD_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "서명 업로드가 아직 설정되지 않았어요."),

    // 소셜 로그인 (AUTH)
    SOCIAL_LOGIN_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "구글 로그인이 아직 준비되지 않았어요."),

    /* --- 요금제 (PLAN) ---
     * 402 와 429 를 나누는 이유: 앱은 402 를 받으면 업그레이드 시트를, 429 를 받으면
     * "잠시 후 다시"를 띄운다. 돈 낸 사용자가 한도에 걸렸을 때 결제를 또 권하지 않기 위해
     * 유료 사용자의 한도 초과는 429(USAGE_LIMIT_EXCEEDED)로 내려간다. */
    PLAN_UPGRADE_REQUIRED(HttpStatus.PAYMENT_REQUIRED, "PRO에서 이용할 수 있는 기능이에요."),
    PLAN_LIMIT_EXCEEDED(HttpStatus.PAYMENT_REQUIRED, "무료 플랜의 이용 한도를 모두 사용했어요."),
    USAGE_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "이용 한도를 모두 사용했어요."),

    // 식단 AI 분석 (DIET AI)
    AI_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "AI 분석 기능이 아직 준비되지 않았어요."),
    AI_DAILY_LIMIT_EXCEEDED(HttpStatus.TOO_MANY_REQUESTS, "오늘의 AI 분석 횟수를 모두 사용했어요. 내일 다시 시도해주세요."),
    AI_RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "지금은 AI 분석 요청이 많아요. 잠시 후 다시 시도해주세요."),
    AI_ANALYSIS_FAILED(HttpStatus.BAD_GATEWAY, "AI 분석에 실패했어요. 잠시 후 다시 시도해주세요."),
    // 사진 관련 — 원인별로 분리해 어떤 문제인지 바로 보이게 한다
    INVALID_PHOTO_URL(HttpStatus.BAD_REQUEST, "앱에서 촬영·선택해 올린 사진만 분석할 수 있어요."),
    PHOTO_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "사진 용량이 너무 커요 (최대 10MB). 더 작은 사진으로 시도해주세요."),
    PHOTO_DOWNLOAD_FAILED(HttpStatus.BAD_GATEWAY, "사진을 불러오지 못했어요. 잠시 후 다시 시도해주세요."),
    PHOTO_UNSUPPORTED_FORMAT(HttpStatus.BAD_REQUEST, "지원하지 않는 이미지 형식이에요. (JPG·PNG·WEBP·HEIC 지원)"),

    // 바코드 식품 DB 조회 (FOOD-DB)
    FOOD_DB_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "바코드 조회 기능이 아직 준비되지 않았어요."),
    FOOD_DB_NOT_FOUND(HttpStatus.NOT_FOUND, "등록되지 않은 바코드예요. 직접 입력해주세요."),
    FOOD_DB_LOOKUP_FAILED(HttpStatus.BAD_GATEWAY, "바코드 조회에 실패했어요. 잠시 후 다시 시도해주세요."),

    // 통화·영상통화 (PLAN.md "통화·영상통화" — Stream Video)
    STREAM_NOT_CONFIGURED(HttpStatus.SERVICE_UNAVAILABLE, "통화 기능이 아직 설정되지 않았어요. 잠시 후 다시 시도해주세요."),
    CALL_NOT_FOUND(HttpStatus.NOT_FOUND, "통화를 찾을 수 없어요."),
    CALL_ALREADY_ACTIVE(HttpStatus.CONFLICT, "이미 진행 중인 통화가 있어요."),
    CALL_INVALID_STATE(HttpStatus.CONFLICT, "이미 끝났거나 받을 수 없는 통화예요.");

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
