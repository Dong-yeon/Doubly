package com.fitto.summary.controller;

import com.fitto.common.ai.AiJobResponse;
import com.fitto.common.ai.AiJobService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.summary.dto.LevelResponse;
import com.fitto.summary.dto.WeeklyRecapResponse;
import com.fitto.summary.service.SummaryService;
import com.fitto.summary.service.WeeklyLetterService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 결산 API — GET /summary/weekly-recap (지난주 운동+식단 요약).
 */
@RestController
@RequestMapping("/api/v1/summary")
public class SummaryController {

    private final SummaryService summaryService;
    private final WeeklyLetterService weeklyLetterService;
    private final AiJobService aiJobService;

    public SummaryController(SummaryService summaryService, WeeklyLetterService weeklyLetterService,
                             AiJobService aiJobService) {
        this.summaryService = summaryService;
        this.weeklyLetterService = weeklyLetterService;
        this.aiJobService = aiJobService;
    }

    @GetMapping("/weekly-recap")
    public ApiResponse<WeeklyRecapResponse> weeklyRecap(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(summaryService.weeklyRecap(user.id()));
    }

    @GetMapping("/level")
    public ApiResponse<LevelResponse> level(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(summaryService.level(user.id()));
    }

    /**
     * AI 커플 주간 레터 — 접수증(202 + jobId)을 돌려주고 생성은 백그라운드에서 한다.
     *
     * <p>GET 이 아니라 POST 인 이유: 이제 이 호출은 "읽기"가 아니라 <b>작업 시작</b>이다.
     * 캐시가 맞아 즉시 끝나는 경우에도 같은 길을 지나간다 — 경로를 둘로 갈라 놓으면
     * 앱이 "빠른 길/느린 길"을 판단해야 하는데, 그 판단의 근거가 서버에만 있다.
     * (캐시 적중이면 첫 폴링에서 바로 DONE 이라 체감은 한 번 더 왕복하는 정도다)
     */
    @PostMapping("/ai-letter")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ApiResponse<AiJobResponse> aiLetter(@AuthenticationPrincipal AuthUser user,
                                               @RequestParam(defaultValue = "false") boolean refresh) {
        Long userId = user.id();
        String jobId = aiJobService.submit(userId, "weekly-letter",
                () -> weeklyLetterService.letter(userId, refresh));
        return ApiResponse.success(new AiJobResponse(jobId), "레터를 쓰고 있어요.");
    }
}
