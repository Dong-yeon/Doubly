package com.fitto.diet.dto;

/**
 * 실시간 에너지 밸런스 계산 결과.
 * bmr/energyBalance 는 신체 정보(키/생년월일/성별)나 체중 기록이 없으면 null.
 */
public record EnergyBalance(Integer bmr, int exerciseCalories, Integer energyBalance) {
}
