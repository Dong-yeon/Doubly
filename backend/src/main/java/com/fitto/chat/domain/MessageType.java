package com.fitto.chat.domain;

/** 메시지 유형 — 설계서 5.8 chat_messages.message_type */
public enum MessageType {
    TEXT,
    IMAGE,
    /** 스티커 — content 에 스티커(이모지)를 담고, 화면에서 말풍선 없이 크게 그린다 */
    STICKER,
    WORKOUT_CARD,
    MEAL_CARD,
    ROUTINE_CARD,
    /** 가상 터치 — content 에 제스처 코드(TouchGesture.CODES 중 하나)를 담는다. PLAN.md "가상 터치" 참고 */
    TOUCH,
    /**
     * 통화 결과 카드 — content 에 "{VOICE|VIDEO}|{MISSED|DECLINED|ENDED}[|durationSec]"
     * 형식으로 담는다. CallService 가 통화 종료 시점에 대신 남긴다(발신자=senderId).
     * PLAN.md "통화·영상통화" 참고.
     */
    CALL_CARD,
    /**
     * 스트릭 마일스톤 축하 카드 — content 에 <b>그대로 읽히는 축하 문장</b>을 담는다.
     * {@code StreakMilestoneNotifier} 가 7·30·100일을 넘는 순간 대신 남긴다(발신자=그 순간
     * 기록을 저장한 사람). 코드가 아니라 문장을 담는 이유는, 이 타입을 모르는 구버전 앱에서도
     * 평범한 말풍선으로 읽히게 하기 위해서다.
     */
    STREAK_CARD
}
