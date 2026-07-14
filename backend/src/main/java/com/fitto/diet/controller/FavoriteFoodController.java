package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.diet.dto.FavoriteFoodResponse;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.service.FavoriteFoodService;
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
 * 식단 즐겨찾기 API — 자주 먹는 음식 원탭 추가용.
 */
@RestController
@RequestMapping("/api/v1/meal/favorites")
public class FavoriteFoodController {

    private final FavoriteFoodService favoriteFoodService;

    public FavoriteFoodController(FavoriteFoodService favoriteFoodService) {
        this.favoriteFoodService = favoriteFoodService;
    }

    @GetMapping
    public ApiResponse<List<FavoriteFoodResponse>> list(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(favoriteFoodService.list(user.id()));
    }

    @PostMapping
    public ApiResponse<FavoriteFoodResponse> save(@AuthenticationPrincipal AuthUser user,
                                                  @Valid @RequestBody SaveFavoriteFoodRequest request) {
        return ApiResponse.success(favoriteFoodService.save(user.id(), request), "즐겨찾기에 저장했어요.");
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal AuthUser user, @PathVariable Long id) {
        favoriteFoodService.delete(user.id(), id);
        return ApiResponse.success(null, "즐겨찾기에서 삭제했어요.");
    }
}
