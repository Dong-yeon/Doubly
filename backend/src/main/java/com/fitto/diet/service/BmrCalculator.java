package com.fitto.diet.service;

import com.fitto.body.domain.BodyMetric;
import com.fitto.common.time.KstClock;
import com.fitto.user.domain.Gender;
import com.fitto.user.domain.User;

import java.math.BigDecimal;
import java.time.Period;

/**
 * 기초대사량(BMR) 계산.
 * {@link EnergyBalanceService}(실시간 에너지 밸런스)와 {@link NutritionService}
 * (목표 칼로리 자동 계산)가 공유한다.
 *
 * <p><b>체지방률이 있으면 Katch-McArdle</b>(제지방량 기준), 없으면 <b>Mifflin-St Jeor</b>(키·나이·성별).
 * Mifflin 은 체중을 전부 같은 무게로 보므로 근육이 많은 사람은 낮게, 체지방이 많은 사람은 높게 나온다.
 * 체지방률은 체중과 <b>같은 측정 행</b>의 값만 쓴다 — 다른 날의 체지방률을 섞으면 제지방량이 틀어진다.
 *
 * <p>근육량(골격근량)은 받지 않는다. 표준 공식의 입력은 제지방량이고, 골격근량은 그 일부일 뿐이라
 * 그대로 넣을 식이 없다. 인바디 결과지의 체지방률을 넣는 쪽이 같은 효과를 낸다.
 */
final class BmrCalculator {

    /** 인바디·체지방계가 내는 현실적인 범위 — 밖이면 오입력으로 보고 Mifflin 으로 돌아간다 */
    private static final double MIN_BODY_FAT_PCT = 3;
    private static final double MAX_BODY_FAT_PCT = 60;

    private BmrCalculator() {
    }

    /** 체중 기록(체지방률 포함 가능)으로 계산한다. 계산할 수 없으면 null. */
    static Integer calc(User user, BodyMetric metric) {
        if (metric == null || metric.getWeightKg() == null) return null;
        BigDecimal fat = metric.getBodyFatPct();
        if (usableBodyFat(fat)) {
            return katchMcArdle(metric.getWeightKg().doubleValue(), fat.doubleValue());
        }
        return mifflin(user, metric.getWeightKg());
    }

    /** 이 기록으로 계산하면 체지방률이 반영되는가 — 마법사가 "체지방률 반영" 안내를 붙일 때 쓴다 */
    static boolean usesBodyFat(BodyMetric metric) {
        return metric != null && metric.getWeightKg() != null && usableBodyFat(metric.getBodyFatPct());
    }

    private static boolean usableBodyFat(BigDecimal fat) {
        return fat != null && fat.doubleValue() >= MIN_BODY_FAT_PCT && fat.doubleValue() <= MAX_BODY_FAT_PCT;
    }

    /** 370 + 21.6 × 제지방량(kg) */
    static int katchMcArdle(double weightKg, double bodyFatPct) {
        double leanKg = weightKg * (1 - bodyFatPct / 100);
        return (int) Math.round(370 + 21.6 * leanKg);
    }

    /** 남: 10×체중+6.25×키-5×나이+5, 여: 10×체중+6.25×키-5×나이-161. 프로필(키/생년월일/성별)이 없으면 null */
    static Integer mifflin(User user, BigDecimal weightKg) {
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
