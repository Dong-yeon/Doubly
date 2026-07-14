package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.domain.FavoriteFood;
import com.fitto.diet.dto.FavoriteFoodResponse;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.repository.FavoriteFoodRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * 식단 즐겨찾기 — 자주 먹는 음식 저장/조회/삭제. 사용자별.
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
        String name = request.name().trim();
        if (repository.existsByUserIdAndName(userId, name)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 즐겨찾기에 있는 음식이에요.");
        }
        if (repository.findByUserIdOrderByIdDesc(userId).size() >= MAX_FAVORITES) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "즐겨찾기는 최대 " + MAX_FAVORITES + "개까지 저장할 수 있어요.");
        }
        FavoriteFood food = FavoriteFood.builder()
                .userId(userId)
                .name(name)
                .calories(request.calories())
                .carbs(request.carbs())
                .protein(request.protein())
                .fat(request.fat())
                .build();
        repository.save(food);
        return FavoriteFoodResponse.of(food);
    }

    @Transactional
    public void delete(Long userId, Long id) {
        FavoriteFood food = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "즐겨찾기를 찾을 수 없습니다."));
        repository.delete(food);
    }
}
