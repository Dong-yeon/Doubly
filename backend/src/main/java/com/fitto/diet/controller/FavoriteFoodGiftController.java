package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.FavoriteFoodGiftResponse;
import com.fitto.diet.dto.SendFavoriteFoodGiftRequest;
import com.fitto.diet.service.FavoriteFoodGiftService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 즐겨찾기 음식 공유 API — 내 즐겨찾기 세트를 애인에게 보내고 애인이 수락/거절한다.
 */
@RestController
@RequestMapping("/api/v1/meal/favorite-gifts")
public class FavoriteFoodGiftController {

    private final FavoriteFoodGiftService giftService;

    public FavoriteFoodGiftController(FavoriteFoodGiftService giftService) {
        this.giftService = giftService;
    }

    @PostMapping("/{favoriteFoodId}/send")
    public ApiResponse<FavoriteFoodGiftResponse> send(@AuthenticationPrincipal AuthUser user,
                                                       @PathVariable Long favoriteFoodId,
                                                       @Valid @RequestBody SendFavoriteFoodGiftRequest request) {
        return ApiResponse.success(giftService.send(user.id(), favoriteFoodId, request.message()), "즐겨찾기를 공유했어요.");
    }

    @GetMapping("/received")
    public ApiResponse<List<FavoriteFoodGiftResponse>> received(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(giftService.received(user.id()));
    }

    @GetMapping("/sent")
    public ApiResponse<List<FavoriteFoodGiftResponse>> sent(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(giftService.sent(user.id()));
    }

    @PostMapping("/{giftId}/accept")
    public ApiResponse<FavoriteFoodGiftResponse> accept(@AuthenticationPrincipal AuthUser user, @PathVariable Long giftId) {
        return ApiResponse.success(giftService.accept(user.id(), giftId), "즐겨찾기를 받았어요!");
    }

    @PostMapping("/{giftId}/decline")
    public ApiResponse<Void> decline(@AuthenticationPrincipal AuthUser user, @PathVariable Long giftId) {
        giftService.decline(user.id(), giftId);
        return ApiResponse.success(null, "선물을 정중히 사양했어요.");
    }
}
