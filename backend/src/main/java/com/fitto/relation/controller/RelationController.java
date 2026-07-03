package com.fitto.relation.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.relation.dto.ConnectRequest;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.dto.SetAnniversaryRequest;
import com.fitto.relation.dto.SetBackgroundRequest;
import com.fitto.relation.dto.SetDietGoalRequest;
import com.fitto.relation.service.RelationService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 관계 API — 설계서 4.3. 트레이너 관련 엔드포인트는 phase 6~7.
 */
@RestController
@RequestMapping("/api/v1/relations")
public class RelationController {

    private final RelationService relationService;

    public RelationController(RelationService relationService) {
        this.relationService = relationService;
    }

    @PostMapping("/couple/invite")
    public ApiResponse<InviteCodeResponse> createCoupleInvite(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(relationService.createCoupleInvite(user.id()));
    }

    @PostMapping("/couple/connect")
    public ApiResponse<RelationResponse> connectCouple(@AuthenticationPrincipal AuthUser user,
                                                       @Valid @RequestBody ConnectRequest request) {
        return ApiResponse.success(
                relationService.connectCouple(user.id(), request.code()), "커플로 연결되었습니다.");
    }

    @PostMapping("/trainer/invite")
    public ApiResponse<InviteCodeResponse> createTrainerInvite(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(relationService.createTrainerInvite(user.id()), "회원 초대코드가 생성되었습니다.");
    }

    @PostMapping("/trainer/connect")
    public ApiResponse<RelationResponse> connectTrainer(@AuthenticationPrincipal AuthUser user,
                                                        @Valid @RequestBody ConnectRequest request) {
        return ApiResponse.success(
                relationService.connectTrainer(user.id(), request.code()), "트레이너와 연결되었습니다.");
    }

    @GetMapping
    public ApiResponse<List<RelationResponse>> myRelations(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(relationService.findMyRelations(user.id()));
    }

    @PutMapping("/couple/background")
    public ApiResponse<RelationResponse> setBackground(@AuthenticationPrincipal AuthUser user,
                                                       @Valid @RequestBody SetBackgroundRequest request) {
        return ApiResponse.success(
                relationService.setCoupleBackground(user.id(), request.backgroundImageUrl()),
                "배경이 변경되었습니다.");
    }

    @PutMapping("/couple/anniversary")
    public ApiResponse<RelationResponse> setAnniversary(@AuthenticationPrincipal AuthUser user,
                                                        @Valid @RequestBody SetAnniversaryRequest request) {
        return ApiResponse.success(
                relationService.setAnniversary(user.id(), request.anniversaryDate()),
                "기념일이 설정되었습니다.");
    }

    @PutMapping("/couple/diet-goal")
    public ApiResponse<RelationResponse> setDietGoal(@AuthenticationPrincipal AuthUser user,
                                                     @Valid @RequestBody SetDietGoalRequest request) {
        return ApiResponse.success(
                relationService.setDietGoal(user.id(), request.dietGoalDays()),
                "식단 목표가 설정되었습니다.");
    }

    @GetMapping("/{id}")
    public ApiResponse<RelationResponse> relationDetail(@AuthenticationPrincipal AuthUser user,
                                                        @PathVariable Long id) {
        return ApiResponse.success(relationService.findRelation(user.id(), id));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<Void> endRelation(@AuthenticationPrincipal AuthUser user,
                                         @PathVariable Long id) {
        relationService.endRelation(user.id(), id);
        return ApiResponse.success(null, "관계가 해제되었습니다.");
    }
}
