package com.fitto.chat.dto;

import java.util.List;

/**
 * 메시지의 이모지별 리액션 요약.
 *
 * <p>"내가 눌렀는지"를 서버가 boolean 으로 계산해 주지 않고 <b>누른 사람 id 목록</b>을 준다.
 * 리액션 변경은 방 전체에 브로드캐스트되는데, 뷰어 기준 boolean 을 실으면 상대 화면에서
 * 반대로 표시된다. 목록을 주면 각 클라이언트가 자기 id 로 판단한다(2인 대화라 목록도 짧다).
 */
public record ChatReactionSummary(
        String emoji,
        long count,
        List<Long> userIds
) {
}
