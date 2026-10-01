package com.fitto.dataexport;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.dataexport.dto.ExportPageResponse;
import com.fitto.dataexport.dto.ExportSummaryResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 기록 내보내기 (docs/DATA_EXPORT_2026-10-01.md).
 *
 * <p>relationId 를 받지 않는다 — 토큰의 사용자와 그 사람의 활성 커플로만 정한다.
 */
@RestController
@RequestMapping("/api/v1/export")
public class DataExportController {

    private final DataExportService service;

    public DataExportController(DataExportService service) {
        this.service = service;
    }

    @GetMapping("/summary")
    public ApiResponse<ExportSummaryResponse> summary(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(service.summary(user.id()));
    }

    /** 새 내보내기 시작 — 주당 횟수를 한 번 쓴다. 이어받기는 부르지 않는다. */
    @PostMapping("/start")
    public ApiResponse<ExportSummaryResponse> start(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(service.start(user.id()));
    }

    @GetMapping("/sections/{section}")
    public ApiResponse<ExportPageResponse> page(@AuthenticationPrincipal AuthUser user,
                                                @PathVariable String section,
                                                @RequestParam(required = false) Long cursor,
                                                @RequestParam(required = false) Integer limit) {
        return ApiResponse.success(service.page(user.id(), section, cursor, limit));
    }
}
