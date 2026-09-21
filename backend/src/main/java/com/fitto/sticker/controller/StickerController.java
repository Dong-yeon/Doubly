package com.fitto.sticker.controller;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.sticker.dto.StickerPackResponse;
import com.fitto.sticker.dto.StickerPurchaseVerifyRequest;
import com.fitto.sticker.service.StickerPurchaseService;
import com.fitto.sticker.service.StickerService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 스티커 팩 목록 + 낱개 구매 검증.
 *
 * <p><b>왜 {@code /plan/me} 에 얹지 않았나</b>: 플랜 응답은 앱이 켜질 때마다 도는 조회이고
 * 이미 기능 40개의 상태를 싣고 있다. 팩은 이모티콘 패널을 열 때만 필요한 정보라, 거기에
 * 더하면 모든 화면이 쓰지도 않을 팩 목록을 매번 받는다 — {@code PlanController} 가
 * {@code /auth/me} 에 플랜을 얹지 않은 것과 같은 판단이다.
 */
@RestController
@RequestMapping("/api/v1/stickers")
public class StickerController {

    private final StickerService stickerService;
    private final StickerPurchaseService purchaseService;

    public StickerController(StickerService stickerService, StickerPurchaseService purchaseService) {
        this.stickerService = stickerService;
        this.purchaseService = purchaseService;
    }

    /** 팩 전체 + 내 잠금 상태. 잠긴 팩도 함께 내린다 — 앱이 자물쇠를 그려야 판매가 된다. */
    @GetMapping("/packs")
    public ApiResponse<List<StickerPackResponse>> packs(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(stickerService.entitlements(user.id()).stream()
                .map(StickerPackResponse::from)
                .toList());
    }

    /**
     * Play 결제 직후 — 검증하고 팩을 연다.
     *
     * <p>갱신된 팩 목록을 그대로 돌려준다. 앱이 결제 성공 후 목록을 또 조회하지 않아도
     * 되고, "결제는 됐는데 화면은 그대로"인 구간이 생기지 않는다.
     */
    @PostMapping("/purchases/google")
    public ApiResponse<List<StickerPackResponse>> verifyGoogle(@AuthenticationPrincipal AuthUser user,
                                                               @RequestBody StickerPurchaseVerifyRequest request) {
        requireReceipt(request);
        purchaseService.verifyGoogle(user.id(), request.packId(), request.receipt());
        return packs(user);
    }

    /** App Store 결제 직후 — {@link #verifyGoogle} 의 짝. */
    @PostMapping("/purchases/apple")
    public ApiResponse<List<StickerPackResponse>> verifyApple(@AuthenticationPrincipal AuthUser user,
                                                              @RequestBody StickerPurchaseVerifyRequest request) {
        requireReceipt(request);
        purchaseService.verifyApple(user.id(), request.packId(), request.receipt());
        return packs(user);
    }

    private void requireReceipt(StickerPurchaseVerifyRequest request) {
        if (request == null || request.receipt() == null || request.receipt().isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT);
        }
    }
}
