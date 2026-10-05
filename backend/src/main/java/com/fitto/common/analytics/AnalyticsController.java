package com.fitto.common.analytics;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 프론트 전용 이벤트 로깅 진입점 — 서버 자체 발생 지점이 없는 이벤트(홈 화면 진입 등)만 받는다.
 * 대부분의 이벤트(기능 사용/차단·가입·로그인·커플 연결)는 {@link EventLogService} 를 서버
 * 코드가 직접 부르므로 이 컨트롤러를 거치지 않는다.
 */
@RestController
@RequestMapping("/api/v1/analytics")
public class AnalyticsController {

    private static final Logger log = LoggerFactory.getLogger(AnalyticsController.class);

    private final EventLogService eventLogService;

    public AnalyticsController(EventLogService eventLogService) {
        this.eventLogService = eventLogService;
    }

    @PostMapping("/events")
    public ApiResponse<Void> log(@AuthenticationPrincipal AuthUser user,
                                 @Valid @RequestBody LogEventRequest request) {
        eventLogService.log(user.id(), request.eventType().name(), request.detail());
        /*
         * 소켓 지연은 운영 로그에서 바로 센다 — event_logs 는 DB 접속 정보가 있어야 볼 수 있지만, 이 원인 조사는
         * `railway logs` 로 해 왔다(docs/server-stability-current-state.md §11·§12). 앱 세션당 최대 5건이라 로그가 넘치지 않는다.
         */
        if (request.eventType() == ClientAnalyticsEvent.CHAT_SOCKET_SLOW) {
            log.info("채팅 소켓 재연결 지연 userId={} {}", user.id(), request.detail());
        }
        return ApiResponse.success(null);
    }
}
