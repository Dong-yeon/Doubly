package com.fitto.body.controller;

import com.fitto.body.dto.BodyMetricResponse;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 신체 측정 & 진행 사진 API.
 */
@RestController
@RequestMapping("/api/v1/body-metrics")
public class BodyMetricController {

    private final BodyMetricService bodyMetricService;

    public BodyMetricController(BodyMetricService bodyMetricService) {
        this.bodyMetricService = bodyMetricService;
    }

    @GetMapping
    public ApiResponse<List<BodyMetricResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(bodyMetricService.list(user.id()));
    }

    @PostMapping
    public ApiResponse<BodyMetricResponse> save(@AuthenticationPrincipal AuthUser user,
                                                @Valid @RequestBody SaveBodyMetricRequest request) {
        return ApiResponse.success(bodyMetricService.save(user.id(), request), "측정 기록을 저장했어요.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        bodyMetricService.delete(user.id(), id);
        return ApiResponse.success(null, "측정 기록을 삭제했어요.");
    }
}
