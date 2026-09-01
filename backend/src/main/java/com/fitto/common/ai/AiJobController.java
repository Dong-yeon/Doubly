package com.fitto.common.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 백그라운드 AI 작업 폴링 — 작업 종류와 무관한 <b>하나</b>의 엔드포인트다.
 *
 * <p>기능마다 폴링 경로를 따로 두면 새 AI 기능을 비동기로 바꿀 때마다 엔드포인트가 하나씩
 * 늘고 앱도 매번 새 폴링 코드를 쓴다. 결과 타입만 다를 뿐 "됐나요?"를 묻는 방식은 같으므로
 * 여기 하나로 모은다({@link AiJobStatusResponse#result} 가 타입 없는 JSON 인 이유).
 */
@RestController
@RequestMapping("/api/v1/ai/jobs")
public class AiJobController {

    private final AiJobService aiJobService;
    private final ObjectMapper objectMapper;

    public AiJobController(AiJobService aiJobService, ObjectMapper objectMapper) {
        this.aiJobService = aiJobService;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/{jobId}")
    public ApiResponse<AiJobStatusResponse> poll(@AuthenticationPrincipal AuthUser user,
                                                 @PathVariable String jobId) {
        return ApiResponse.success(
                AiJobStatusResponse.of(aiJobService.poll(user.id(), jobId), objectMapper));
    }
}
