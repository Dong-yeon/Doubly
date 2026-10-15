package com.fitto.game;

import com.fitto.game.spotdiff.SpotDiffRules;
import com.fitto.game.spotdiff.SpotLayout;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 틀린그림찾기 판정 수학 — 순수 함수 */
class SpotDiffRulesTest {

    @Test
    void 세로_사진에서도_경계는_픽셀로_잰다() {
        // 1200×1600(세로) — r 0.02 × 긴 변 1600 = 32, 허용치 0.02 × 짧은 변 1200 = 24 → 56px
        var d = new SpotDiffRules.Diff(0, "flip", 0.5, 0.5, 0.02);
        List<SpotDiffRules.Diff> diffs = List.of(d);
        assertThat(SpotDiffRules.threshold(d, 1200, 1600)).isEqualTo(56.0);
        assertThat(SpotDiffRules.judge(diffs, Set.of(), 1200, 1600, 0.5 + 55.5 / 1200, 0.5)).isPresent();
        assertThat(SpotDiffRules.judge(diffs, Set.of(), 1200, 1600, 0.5 + 56.5 / 1200, 0.5)).isEmpty();
        assertThat(SpotDiffRules.judge(diffs, Set.of(), 1200, 1600, 0.5, 0.5 + 55.5 / 1600)).isPresent();
        assertThat(SpotDiffRules.judge(diffs, Set.of(), 1200, 1600, 0.5, 0.5 + 56.5 / 1600)).isEmpty();
    }

    @Test
    void 겹친_자리에서는_새로_찾을_차이가_먼저다() {
        var found = new SpotDiffRules.Diff(0, "color", 0.50, 0.5, 0.03);
        var fresh = new SpotDiffRules.Diff(1, "color", 0.53, 0.5, 0.03);
        var hit = SpotDiffRules.judge(List.of(found, fresh), Set.of(0), 1000, 1000, 0.505, 0.5);
        assertThat(hit).get().extracting(SpotDiffRules.Diff::id).isEqualTo(1);
    }

    @Test
    void 힌트_원은_같은_시드면_같고_정답을_품는다() {
        var d = new SpotDiffRules.Diff(2, "remove", 0.3, 0.6, 0.025);
        var a = SpotDiffRules.hintCircle(d, 1600, 900, 42);
        var b = SpotDiffRules.hintCircle(d, 1600, 900, 42);
        assertThat(a).isEqualTo(b);
        double dist = Math.hypot((a.cx() - d.cx()) * 1600, (a.cy() - d.cy()) * 900);
        assertThat(dist + d.r() * 1600).isLessThanOrEqualTo(a.r() * 1600 + 1e-9);
    }

    @Test
    void 정답_JSON_을_읽는다_깨졌으면_예외() {
        var diffs = SpotLayout.parse("{\"diffs\":[{\"id\":3,\"kind\":\"clone\",\"cx\":0.1,\"cy\":0.2,\"r\":0.03}]}");
        assertThat(diffs).containsExactly(new SpotDiffRules.Diff(3, "clone", 0.1, 0.2, 0.03));
        assertThat(SpotLayout.parse(null)).isEmpty();
        assertThatThrownBy(() -> SpotLayout.parse("{not json")).isInstanceOf(IllegalStateException.class);
    }
}
