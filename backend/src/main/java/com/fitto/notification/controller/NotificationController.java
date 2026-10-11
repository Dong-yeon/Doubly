package com.fitto.notification.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.notification.dto.RegisterTokenRequest;
import com.fitto.notification.service.DeviceTokenService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 푸시 토큰 API — 설계서 CHAT-06 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private final DeviceTokenService deviceTokenService;

    public NotificationController(DeviceTokenService deviceTokenService) {
        this.deviceTokenService = deviceTokenService;
    }

    @PostMapping("/token")
    public ApiResponse<Void> registerToken(@AuthenticationPrincipal AuthUser user,
                                           @Valid @RequestBody RegisterTokenRequest request) {
        deviceTokenService.register(user.id(), request.token(), request.platform(), request.channelsVersion());
        return ApiResponse.success(null);
    }
}
