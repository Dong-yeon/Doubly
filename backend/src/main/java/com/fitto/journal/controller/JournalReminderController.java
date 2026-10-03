package com.fitto.journal.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.journal.dto.JournalReminderResponse;
import com.fitto.journal.dto.SetJournalReminderRequest;
import com.fitto.journal.service.JournalReminderService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 하루 기록 리마인드 설정(옵트인). {@code /me/journals/{date}} 와 경로를 나눠 둔다 — 날짜 자리에 "reminder"가
 * 들어가 날짜 파싱 400 으로 새는 일을 아예 만들지 않으려고.
 */
@RestController
@RequestMapping("/api/v1/me/journal-reminder")
public class JournalReminderController {

    private final JournalReminderService reminderService;

    public JournalReminderController(JournalReminderService reminderService) {
        this.reminderService = reminderService;
    }

    /** 꺼져 있으면 data 가 null */
    @GetMapping
    public ApiResponse<JournalReminderResponse> get(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(reminderService.get(user.id()));
    }

    @PutMapping
    public ApiResponse<JournalReminderResponse> set(@AuthenticationPrincipal AuthUser user,
                                                    @Valid @RequestBody SetJournalReminderRequest request) {
        return ApiResponse.success(reminderService.set(user.id(), request.reminderTime()), "알림을 켰어요.");
    }

    @DeleteMapping
    public ApiResponse<Void> remove(@AuthenticationPrincipal AuthUser user) {
        reminderService.remove(user.id());
        return ApiResponse.success(null, "알림을 껐어요.");
    }
}
