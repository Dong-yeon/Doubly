package com.fitto.common.notification;

/**
 * 알림 카테고리 — SettingsScreen에서 따로 켜고 끌 수 있는 4가지 묶음.
 * User.allowsCategory 가 이 값과 카테고리별 설정 컬럼을 대조해 최종 발송 여부를 정한다.
 */
public enum NotificationCategory {
    /** 채팅 메시지·리액션·전화(발신/부재중) — 실시간 커플 소통 */
    CHAT,
    /** 커플 캘린더 일정·D-day·추억(작년 오늘) 리마인드 */
    ANNIVERSARY,
    /** 상대의 운동·식단·장소·여행·선물·무드·오늘의 질문 등 활동 알림 — 대부분의 알림이 여기 속한다 */
    PARTNER_ACTIVITY,
    /** 앱이 먼저 부르는 재방문 리마인드(스트릭 위기·질문 미답변·혼자 가입자 프리뷰) */
    REMINDER
}
