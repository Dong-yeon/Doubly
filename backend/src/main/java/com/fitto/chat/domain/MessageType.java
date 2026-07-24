package com.fitto.chat.domain;

/** 메시지 유형 — 설계서 5.8 chat_messages.message_type */
public enum MessageType {
    TEXT,
    IMAGE,
    /** 스티커 — content 에 스티커(이모지)를 담고, 화면에서 말풍선 없이 크게 그린다 */
    STICKER,
    WORKOUT_CARD,
    MEAL_CARD,
    ROUTINE_CARD
}
