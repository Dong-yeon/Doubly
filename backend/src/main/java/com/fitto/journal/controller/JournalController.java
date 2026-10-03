package com.fitto.journal.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.journal.dto.JournalEntryResponse;
import com.fitto.journal.dto.SaveJournalRequest;
import com.fitto.journal.service.JournalService;
import com.fitto.journal.service.JournalShareService;
import com.fitto.journal.dto.ShareJournalRequest;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * 나만의 하루 기록 API — 상대에게 보이지 않는 나에게 쓰는 기록.
 *
 * <p><b>경로에 사용자 id 가 없다.</b> 대상은 언제나 토큰의 주인이고, 날짜가 곧 키다(하루 1개).
 * docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §2-2.
 */
@RestController
@RequestMapping("/api/v1/me/journals")
public class JournalController {

    private final JournalService journalService;
    private final JournalShareService journalShareService;

    public JournalController(JournalService journalService, JournalShareService journalShareService) {
        this.journalService = journalService;
        this.journalShareService = journalShareService;
    }

    /** 한 달 기록 — {@code ?month=2026-10} */
    @GetMapping
    public ApiResponse<List<JournalEntryResponse>> month(@AuthenticationPrincipal AuthUser user,
                                                         @RequestParam String month) {
        return ApiResponse.success(journalService.month(user.id(), month));
    }

    @GetMapping("/{date}")
    public ApiResponse<JournalEntryResponse> day(@AuthenticationPrincipal AuthUser user,
                                                 @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ApiResponse.success(journalService.day(user.id(), date));
    }

    @PutMapping("/{date}")
    public ApiResponse<JournalEntryResponse> save(@AuthenticationPrincipal AuthUser user,
                                                  @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                                  @Valid @RequestBody SaveJournalRequest request) {
        return ApiResponse.success(journalService.save(user.id(), date, request), "기록을 남겼어요.");
    }

    @DeleteMapping("/{date}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user,
                                    @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        journalService.delete(user.id(), date);
        return ApiResponse.success(null, "기록을 지웠어요.");
    }

    /**
     * 우리 기록에 공유 — 사진은 서버가 복사하고 일기 날짜의 일상 글을 만든다(상대에게 푸시가 간다).
     * 한 기록에 한 번, 이미 공유했으면 409. 본문은 공유본에서만 고칠 수 있다.
     */
    @PostMapping("/{date}/share")
    public ApiResponse<JournalEntryResponse> share(@AuthenticationPrincipal AuthUser user,
                                                   @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                                   @Valid @RequestBody(required = false) ShareJournalRequest request) {
        return ApiResponse.success(journalShareService.share(user.id(), date, request), "우리 기록에 공유했어요.");
    }

    /** 사진 업로드 서명 — {@code journal/} 폴더, 사람 단위 {@code JOURNAL_PHOTO} 한도 */
    @PostMapping("/photo-signature")
    public ApiResponse<UploadSignatureResponse> photoSignature(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(journalService.photoSignature(user.id()));
    }
}
