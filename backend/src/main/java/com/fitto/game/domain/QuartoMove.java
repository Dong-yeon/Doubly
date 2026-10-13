package com.fitto.game.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

/**
 * 넷이 같아의 수 한 줄 — 리플레이와 멱등키(V139 {@code quarto_moves}).
 *
 * <p>길막기는 기보를 판 행의 문자열 하나에 담는다. 여기서는 <b>수마다 {@code client_move_id}</b> 를 들어야
 * 재전송을 알아볼 수 있어서 줄을 따로 둔다. 판당 많아야 17줄이다.
 */
@Entity
@Table(name = "quarto_moves")
@EntityListeners(AuditingEntityListener.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QuartoMove {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "game_id", nullable = false)
    private Long gameId;

    /** 0 부터. 0 번째는 첫 말 주기뿐이다 */
    @Column(name = "move_no", nullable = false)
    private Integer moveNo;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 놓은 칸 — 첫 수면 null */
    private Integer place;

    /** 준 말 — 이긴 수·16번째 수면 null. 15번째 놓기 뒤 서버가 채운 말도 여기 남는다 */
    private Integer give;

    @Column(name = "client_move_id", nullable = false, length = 64)
    private String clientMoveId;

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public QuartoMove(Long gameId, int moveNo, Long userId, Integer place, Integer give, String clientMoveId) {
        this.gameId = gameId;
        this.moveNo = moveNo;
        this.userId = userId;
        this.place = place;
        this.give = give;
        this.clientMoveId = clientMoveId;
    }
}
