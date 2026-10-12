package com.fitto.diet.service;

import com.fitto.diet.dto.BarcodeLookupResponse;
import com.fitto.diet.dto.MealAnalysisResponse;
import com.fitto.diet.service.MealCalorieFillService.Planned;
import com.fitto.diet.service.MealCalorieFillService.Row;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 빈 칼로리 채우기의 순수 계산 — 공공 DB 표기값이 먼저, 사용자가 적은 값은 그대로 */
class MealCalorieFillPlanTest {

    private static BarcodeLookupResponse db(String name, int kcal) {
        return new BarcodeLookupResponse(null, name, "1개(120g)", kcal, 50, 3, 1, null, null, null, "FOOD_DB");
    }

    private static MealAnalysisResponse ai(MealAnalysisResponse.AnalyzedFood... foods) {
        return new MealAnalysisResponse(true, List.of(foods), 0, 0, 0, 0, 0, 0, 0, null, "TEXT_IN_PHOTO");
    }

    private static MealAnalysisResponse.AnalyzedFood food(String name, int kcal) {
        return new MealAnalysisResponse.AnalyzedFood(name, kcal, "1인분", 10, 10, 10, 0, 0, 0, null);
    }

    @Test
    void 표기값으로_찾은_건_표기값_못_찾은_것만_AI() {
        List<Row> rows = List.of(
                new Row("바나나", null, null, null, null, null),
                new Row("떡볶이", null, null, null, null, null));

        List<Planned> out = MealCalorieFillService.plan(rows,
                Map.of("바나나", db("바나나", 105)), List.of(1), ai(food("떡볶이", 480)));

        assertThat(out).extracting(p -> p.row().calories()).containsExactly(105, 480);
        assertThat(out).extracting(p -> p.row().portion()).containsExactly("1개(120g)", "1인분");
        assertThat(out).allMatch(Planned::filled);
    }

    @Test
    void 사용자가_적은_값은_건드리지_않는다() {
        List<Row> rows = List.of(
                new Row("샐러드", "1접시", 200, null, null, null),
                new Row("떡볶이", "반 접시", null, 40, null, null));

        List<Planned> out = MealCalorieFillService.plan(rows, Map.of(), List.of(1), ai(food("떡볶이", 480)));

        assertThat(out.get(0)).isEqualTo(new Planned(rows.get(0), false));
        // 적어 둔 양·탄수화물은 남기고 빈 칸만 채운다
        assertThat(out.get(1).row()).isEqualTo(new Row("떡볶이", "반 접시", 480, 40, 10, 10));
    }

    @Test
    void AI_를_못_불렀으면_빈_줄은_빈_채로_남는다() {
        List<Row> rows = List.of(
                new Row("바나나", null, null, null, null, null),
                new Row("떡볶이", null, null, null, null, null));

        List<Planned> out = MealCalorieFillService.plan(rows, Map.of("바나나", db("바나나", 105)), List.of(1), null);

        assertThat(out).extracting(p -> p.row().calories()).containsExactly(105, null);
        assertThat(out).extracting(Planned::filled).containsExactly(true, false);
    }

    @Test
    void 이름은_대소문자_앞뒤_공백을_무시하고_맞춘다() {
        assertThat(MealCalorieFillService.key("  Coke ")).isEqualTo(MealCalorieFillService.key("coke"));
    }
}
