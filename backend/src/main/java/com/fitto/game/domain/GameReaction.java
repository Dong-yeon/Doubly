package com.fitto.game.domain;

import java.util.Arrays;
import java.util.Optional;

/**
 * 게임 판 위에서 주고받는 즉석 반응 — 저장하지 않고 소켓으로만 흘려보낸다.
 *
 * <p>협동 스도쿠는 "여기 틀린 것 같아", 오목은 "한 수만 무르자" 같은 말이 실제로 오가는데
 * 게임 화면에는 아무 소통 수단이 없었다. 채팅방으로 나갔다 오게 하면 판의 흐름이 끊기므로,
 * 판 위에서 한 번 눌러 상대 화면에 띄우는 최소 수단만 둔다.
 *
 * <p><b>서버가 목록을 쥐는 이유</b>: 임의 문자열을 그대로 브로드캐스트하면 길이·내용을 통제할 수
 * 없고, 나중에 이모지를 바꾸거나 늘릴 때 구버전 앱이 모르는 값을 받는다. 키만 주고받고 표시
 * 문구는 양쪽이 각자 가진다.
 */
public enum GameReaction {

    CLAP("👏", "잘한다"),
    WOW("😮", "우와"),
    THINK("🤔", "음…"),
    LAUGH("😂", "ㅋㅋㅋ"),
    HEART("❤️", "하트"),
    TEASE("😤", "두고 보자");

    private final String emoji;
    private final String label;

    GameReaction(String emoji, String label) {
        this.emoji = emoji;
        this.label = label;
    }

    public String emoji() {
        return emoji;
    }

    public String label() {
        return label;
    }

    /** 모르는 키는 비어 있는 Optional — 구버전/신버전 앱이 섞여도 500 이 나지 않는다. */
    public static Optional<GameReaction> parse(String key) {
        if (key == null) return Optional.empty();
        return Arrays.stream(values()).filter(r -> r.name().equalsIgnoreCase(key)).findFirst();
    }
}
