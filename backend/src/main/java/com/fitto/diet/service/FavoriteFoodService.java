package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.domain.FavoriteFood;
import com.fitto.diet.domain.FavoriteFoodItem;
import com.fitto.diet.dto.FavoriteFoodItemRequest;
import com.fitto.diet.dto.FavoriteFoodResponse;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.repository.FavoriteFoodRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 식단 즐겨찾기 — 자주 먹는 음식 "세트" 저장/조회/삭제. 사용자별.
 */
@Service
@Transactional(readOnly = true)
public class FavoriteFoodService {

    private static final int MAX_FAVORITES = 50;

    private final FavoriteFoodRepository repository;

    public FavoriteFoodService(FavoriteFoodRepository repository) {
        this.repository = repository;
    }

    public List<FavoriteFoodResponse> list(Long userId) {
        return repository.findByUserIdOrderByIdDesc(userId).stream()
                .map(FavoriteFoodResponse::of)
                .toList();
    }

    @Transactional
    public FavoriteFoodResponse save(Long userId, SaveFavoriteFoodRequest request) {
        String name = resolveName(request);
        if (repository.existsByUserIdAndName(userId, name)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 즐겨찾기에 있는 음식이에요.");
        }
        if (repository.findByUserIdOrderByIdDesc(userId).size() >= MAX_FAVORITES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "즐겨찾기는 최대 " + MAX_FAVORITES + "개까지 저장할 수 있어요.");
        }
        FavoriteFood food = FavoriteFood.builder()
                .userId(userId)
                .name(name)
                .build();
        int orderNo = 0;
        for (FavoriteFoodItemRequest item : request.items()) {
            food.addItem(FavoriteFoodItem.builder()
                    .name(item.name().trim())
                    .calories(item.calories())
                    .carbs(item.carbs())
                    .protein(item.protein())
                    .fat(item.fat())
                    .orderNo(orderNo++)
                    .build());
        }
        repository.save(food);
        return FavoriteFoodResponse.of(food);
    }

    /** 세트 이름 — 직접 입력했으면 그대로, 비어있으면 항목명을 이어붙여 자동 생성("닭가슴살, 고구마, 아몬드") */
    private String resolveName(SaveFavoriteFoodRequest request) {
        if (request.name() != null && !request.name().isBlank()) {
            return request.name().trim();
        }
        return request.items().stream()
                .map(i -> i.name().trim())
                .reduce((a, b) -> a + ", " + b)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_INPUT, "즐겨찾기에 담을 음식을 1개 이상 입력해주세요."));
    }

    @Transactional
    public void delete(Long userId, Long id) {
        FavoriteFood food = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "즐겨찾기를 찾을 수 없습니다."));
        repository.delete(food);
    }
}
