package com.fitto.game.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Component;

/**
 * 게임 서비스들이 공유하는 관계·이름 조회. 게임 도메인의 모든 진입점이 "활성 커플이 있는가"를
 * 먼저 묻고 상대 이름을 응답에 실으므로, 같은 다섯 줄이 서비스마다 반복되던 것을 모았다.
 */
@Component
public class GameCouples {

    private final RelationRepository relationRepository;
    private final UserRepository userRepository;

    public GameCouples(RelationRepository relationRepository, UserRepository userRepository) {
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
    }

    /** 활성 커플 관계 — 없으면 "커플 연결 후 사용할 수 있는 기능" 400 */
    public Relation active(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    /** 탈퇴 등으로 사용자가 없어도 화면이 빈 문자열을 띄우지 않도록 "커플"로 대체한다. */
    public String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }

    /** 상대 이름 — 상대가 없으면 null(응답의 partnerName 이 비는 경우) */
    public String partnerName(Relation couple, Long viewerId) {
        Long partnerId = couple.partnerOf(viewerId);
        return partnerId == null ? null : userName(partnerId);
    }
}
