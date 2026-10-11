package com.fitto.place.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.place.dto.MenuBoardAnalysisResponse;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 메뉴판 분석 응답 → 화면 목록 매핑(MenuBoardService.toAnalysis) — Gemini 없이 응답 모양만 본다 */
class MenuBoardAnalysisMappingTest {

    private final ObjectMapper om = new ObjectMapper();

    private MenuBoardAnalysisResponse map(String json) throws Exception {
        JsonNode node = om.readTree(json);
        return MenuBoardService.toAnalysis(node);
    }

    @Test
    void 메뉴판이_아니면_빈_목록() throws Exception {
        MenuBoardAnalysisResponse res = map("{\"isMenu\":false,\"items\":[{\"name\":\"김치찌개\",\"price\":9000}]}");
        assertThat(res.isMenu()).isFalse();
        assertThat(res.items()).isEmpty();
    }

    @Test
    void 이름을_다듬고_같은_메뉴는_처음_것만_남긴다() throws Exception {
        MenuBoardAnalysisResponse res = map("""
                {"isMenu":true,"items":[
                  {"name":"  물냉면 ","price":13000},
                  {"name":"아메리카노 (L)","price":5000},
                  {"name":"아메리카노(L)","price":5500},
                  {"name":"   ","price":1000},
                  {"name":"비빔냉면"}
                ]}""");
        assertThat(res.isMenu()).isTrue();
        assertThat(res.items()).extracting(MenuBoardAnalysisResponse.Item::name)
                .containsExactly("물냉면", "아메리카노 (L)", "비빔냉면");
        assertThat(res.items().get(1).price()).isEqualTo(5000);
        // 가격이 안 적힌 메뉴는 0원이 아니라 모름이다
        assertThat(res.items().get(2).price()).isNull();
    }

    @Test
    void 터무니없는_가격은_비운다() throws Exception {
        MenuBoardAnalysisResponse res = map("""
                {"isMenu":true,"items":[{"name":"공깃밥","price":0},{"name":"한우","price":999999999},{"name":"소주","price":-5}]}""");
        assertThat(res.items()).extracting(MenuBoardAnalysisResponse.Item::price).containsOnlyNulls();
    }

    @Test
    void 메뉴판이라면서_한_줄도_못_읽었으면_메뉴판이_아닌_것과_같다() throws Exception {
        MenuBoardAnalysisResponse res = map("{\"isMenu\":true,\"items\":[{\"name\":\"\"}]}");
        assertThat(res.isMenu()).isFalse();
    }

    @Test
    void 메뉴는_80개까지만() throws Exception {
        StringBuilder sb = new StringBuilder("{\"isMenu\":true,\"items\":[");
        for (int i = 0; i < 100; i++) {
            if (i > 0) sb.append(',');
            sb.append("{\"name\":\"메뉴").append(i).append("\",\"price\":1000}");
        }
        sb.append("]}");
        assertThat(map(sb.toString()).items()).hasSize(MenuBoardService.MAX_ITEMS);
    }
}
