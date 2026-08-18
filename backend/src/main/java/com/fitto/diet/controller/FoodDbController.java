package com.fitto.diet.controller;

import com.fitto.common.response.ApiResponse;
import com.fitto.diet.dto.BarcodeLookupResponse;
import com.fitto.diet.service.FoodDbClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 바코드 식품 DB 조회 API. 공공 API(식품안전나라) 호출량 파악 전이라 플랜 한도는 아직 걸지 않는다
 * — 실사용 트래픽을 보고 필요하면 {@code Feature} 에 추가한다(다른 원가형 기능과 같은 방식).
 */
@RestController
@RequestMapping("/api/v1/food-db")
public class FoodDbController {

    private final FoodDbClient foodDbClient;

    public FoodDbController(FoodDbClient foodDbClient) {
        this.foodDbClient = foodDbClient;
    }

    @GetMapping("/barcode/{code}")
    public ApiResponse<BarcodeLookupResponse> barcode(@PathVariable String code) {
        return ApiResponse.success(foodDbClient.lookup(code));
    }
}
