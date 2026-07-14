package com.fitto.question.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.common.security.AuthUser;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.dto.DailyQuestionResponse;
import com.fitto.question.dto.QuestionHistoryResponse;
import com.fitto.question.service.DailyQuestionService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 데일리 질문 (커플 Q&A) API.
 */
@RestController
@RequestMapping("/api/v1/daily-question")
public class DailyQuestionController {

    private final DailyQuestionService questionService;

    public DailyQuestionController(DailyQuestionService questionService) {
        this.questionService = questionService;
    }

    @GetMapping
    public ApiResponse<DailyQuestionResponse> today(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(questionService.today(user.id()));
    }

    @PostMapping
    public ApiResponse<DailyQuestionResponse> answer(@AuthenticationPrincipal AuthUser user,
                                                     @Valid @RequestBody AnswerRequest request) {
        return ApiResponse.success(questionService.answer(user.id(), request), "답을 저장했어요.");
    }

    @GetMapping("/history")
    public ApiResponse<List<QuestionHistoryResponse>> history(@AuthenticationPrincipal AuthUser user) {
        return ApiResponse.success(questionService.history(user.id()));
    }
}
