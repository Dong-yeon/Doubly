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
    STREAK_CARD,
    /**
     * 음성 메시지(최대 30초) — content 에 "{audioUrl}|{durationSec}" 형식으로 담는다.
     * 업로드 한도(Feature.VOICE_MESSAGE)는 발신 시점이 아니라 업로드 서명 발급 시점에
     * 소비한다(ChatController.voiceUploadSignature) — IMAGE 와 같은 패턴(UploadController).
     */
    VOICE_MESSAGE,
    /**
     * 우리 이모지(AI 가 애인 얼굴로 그린 감정 이모지, V80) — content 에 {@code couple_emojis.id},
     * image_url 에 그 행의 URL 을 <b>복사</b>해 담는다. 트레이에서 숨긴 뒤에도 지난 메시지가 조인 없이
     * 그려져야 해서다. STICKER 에 얹지 않은 이유: STICKER 의 content 는 로컬 번들 코드이고 서버가
     * StickerPack/AnimatedSticker 로 프리미엄 판정을 하는데, 원격 URL 을 섞으면 그 판정·알림 미리보기·
     * 검색 제외·예약 전송 검증이 전부 분기해야 한다. 전송 시 PRO 판정은 하지 않는다 — 만들 때 이미
     * 게이팅했고 커플 공용이라 상대(무료일 수도)도 쓴다. docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md §5-6.
     */
    COUPLE_EMOJI,
    /**
     * 커플 게임 결과 카드(협동 스도쿠 완성 등, V86) — STREAK_CARD 와 같은 규칙으로 content 에
     * <b>그대로 읽히는 문장</b>을 담는다. 구버전 앱에서도 평범한 말풍선으로 읽힌다.
     * {@code SudokuService} 가 완성 시점에 대신 남긴다(발신자=마지막 칸을 채운 사람).
     */
    GAME_CARD
}
