package com.fitto.game.controller;

import com.fitto.common.security.StompPrincipal;
import com.fitto.game.dto.PuzzleBattleEvent;
import com.fitto.game.service.PuzzleBattleService;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import java.security.Principal;

/**
 * 연쇄 퍼즐 대전 수(手) 중계 — {@code /pub/games/{relationId}} 로 올라온 이벤트를 발신자만 확인해
 * {@code /sub/games/{relationId}} 로 그대로 흘린다(§3-2 의 "채팅 패턴을 따라 새 채널").
 *
 * <p>저장하지 않는다. 결과는 REST(finish)로 따로 오고, 라이브 중에 놓친 프레임은 다음 프레임의
 * 판(78자리)이 덮으므로 복구가 필요 없다 — 받는 쪽은 조작이 아니라 <b>결과 판</b>을 신뢰한다(§2-5).
 *
 * <p>구독 쪽 인가는 {@code StompAuthChannelInterceptor}(활성 관계 구성원), 발행 쪽은 여기서
 * 같은 검사를 한다. 남의 relationId 로 발행해 상대 판에 방해를 꽂는 경로를 막는다.
 */
@Controller
public class PuzzleBattleStompController {

    private final PuzzleBattleService battleService;
    private final SimpMessagingTemplate messagingTemplate;

    public PuzzleBattleStompController(PuzzleBattleService battleService,
                                       SimpMessagingTemplate messagingTemplate) {
        this.battleService = battleService;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/games/{relationId}")
    public void relay(@DestinationVariable Long relationId,
                      @Payload PuzzleBattleEvent event,
                      Principal principal) {
        if (!(principal instanceof StompPrincipal stompPrincipal)) {
            return;
        }
        if (event == null || !event.isSane()) {
            return;
        }
        if (!battleService.mayRelay(stompPrincipal.userId(), relationId)) {
            return;
        }
        messagingTemplate.convertAndSend("/sub/games/" + relationId, event.from(stompPrincipal.userId()));
    }
}
