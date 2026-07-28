package com.fitto.common.exception;

import com.fitto.common.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/**
 * 전역 예외 처리 — 설계서 4.1 공통 응답/에러코드 규칙을 일관되게 적용.
 * 클라이언트 오류(4xx)와 서버 오류(5xx)를 구분해 반환한다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e) {
        ErrorCode code = e.getErrorCode();
        return ResponseEntity.status(code.getStatus())
                .body(ApiResponse.error(e.getMessage(), code.name()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining(", "));
        return badRequest(message);
    }

    /** 잘못된/누락된 요청 본문 (예: 깨진 JSON) → 400 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleNotReadable(HttpMessageNotReadableException e) {
        return badRequest("요청 본문을 해석할 수 없습니다.");
    }

    /** 필수 헤더 누락 (예: Authorization) → 400 */
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingHeader(MissingRequestHeaderException e) {
        return badRequest("필수 헤더가 누락되었습니다: " + e.getHeaderName());
    }

    /** 지원하지 않는 HTTP 메서드 → 405 */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Void>> handleMethodNotSupported(HttpRequestMethodNotSupportedException e) {
        return error(ErrorCode.METHOD_NOT_ALLOWED);
    }

    /** 존재하지 않는 경로/리소스 → 404 */
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiResponse<Void>> handleNoResource(NoResourceFoundException e) {
        return error(ErrorCode.NOT_FOUND);
    }

    /**
     * 예상 못 한 예외 → 500.
     *
     * <p>여기서 <b>반드시 스택트레이스를 남긴다</b>. 예전에는 조용히 500 만 돌려줘서
     * 운영 로그(Railway)에 아무 흔적이 없었고, 사용자가 "피드가 500 난다"고 알려와도
     * 서버 쪽에서 원인을 찾을 방법이 없었다. 응답 본문은 그대로 일반 메시지만 내보내
     * 내부 정보를 노출하지 않는다.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception e, HttpServletRequest request) {
        log.error("처리되지 않은 예외 [{} {}]", request.getMethod(), request.getRequestURI(), e);
        return error(ErrorCode.INTERNAL_ERROR);
    }

    // ---- helpers ----

    private ResponseEntity<ApiResponse<Void>> badRequest(String message) {
        return ResponseEntity.status(ErrorCode.INVALID_INPUT.getStatus())
                .body(ApiResponse.error(message, ErrorCode.INVALID_INPUT.name()));
    }

    private ResponseEntity<ApiResponse<Void>> error(ErrorCode code) {
        return ResponseEntity.status(code.getStatus())
                .body(ApiResponse.error(code.getMessage(), code.name()));
    }
}
