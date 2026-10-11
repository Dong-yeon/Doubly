package com.fitto.game.dto;

import java.util.List;

/**
 * 제시어 후보 — 서로 다른 카테고리에서 하나씩.
 * 직접 입력도 허용하므로 이 목록은 "막힐 때의 기본값"에 가깝다.
 */
public record CatchMindWordsResponse(List<Item> candidates) {
    public record Item(String category, String word) {
    }
}
