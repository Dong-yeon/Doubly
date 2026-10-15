package com.fitto.game.spotdiff;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.List;

/**
 * {@code spot_puzzles.layout_json} 읽기 — worker 가 쓰는 모양:
 * {@code {"width":1600,"height":1200,"level":"normal","diffs":[{"id":0,"kind":"color","cx":0.4,"cy":0.3,"r":0.02}]}}.
 * <b>이 값은 응답에 그대로 싣지 않는다.</b>
 */
public final class SpotLayout {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private SpotLayout() {
    }

    public static List<SpotDiffRules.Diff> parse(String json) {
        if (json == null || json.isBlank()) return List.of();
        try {
            JsonNode diffs = MAPPER.readTree(json).path("diffs");
            List<SpotDiffRules.Diff> out = new ArrayList<>();
            for (JsonNode d : diffs) {
                out.add(new SpotDiffRules.Diff(d.path("id").asInt(), d.path("kind").asText(),
                        d.path("cx").asDouble(), d.path("cy").asDouble(), d.path("r").asDouble()));
            }
            return out;
        } catch (Exception e) {
            throw new IllegalStateException("틀린그림찾기 정답 형식이 깨졌어요", e);
        }
    }
}
