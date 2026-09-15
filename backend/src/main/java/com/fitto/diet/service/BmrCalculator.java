package com.fitto.diet.service;

import com.fitto.common.time.KstClock;
import com.fitto.user.domain.Gender;
import com.fitto.user.domain.User;

import java.math.BigDecimal;
import java.time.Period;

/**
 * 기초대사량(BMR) 계산 — Mifflin-St Jeor 공식.
 * {@link EnergyBalanceService}(실시간 에너지 밸런스)와 {@link NutritionService}
 * (목표 칼로리 자동 계산)가 공유한다. 프로필(키/생년월일/성별)이 없으면 계산할 수 없어 null.
 */
final class BmrCalculator {

    private BmrCalculator() {
    }

    /** 남: 10×체중+6.25×키-5×나이+5, 여: 10×체중+6.25×키-5×나이-161 */
    static Integer calc(User user, BigDecimal weightKg) {
        if (user == null || weightKg == null
                || user.getHeightCm() == null || user.getBirthDate() == null || user.getGender() == null) {
            return null;
        }
        // 나이도 KST 기준 오늘로 센다 — 생일 당일 한국 새벽에 한 살 적게 계산되지 않도록
        int age = Period.between(user.getBirthDate(), KstClock.today()).getYears();
        double base = 10 * weightKg.doubleValue() + 6.25 * user.getHeightCm() - 5 * age;
        double bmr = user.getGender() == Gender.MALE ? base + 5 : base - 161;
        return (int) Math.round(bmr);
    }
}
