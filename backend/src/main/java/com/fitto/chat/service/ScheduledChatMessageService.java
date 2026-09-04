package com.fitto.chat.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.domain.ScheduledChatMessage;
import com.fitto.chat.domain.StickerPack;
import com.fitto.chat.dto.ScheduleMessageRequest;
import com.fitto.chat.dto.ScheduledMessageResponse;
import com.fitto.chat.repository.ScheduledChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * 예약 전송 등록/취소/조회 — 실제 발송은 {@link ScheduledChatMessageSweeper} 가 담당한다
 * (docs/CHAT_RETENTION_AND_KAKAO_BENCHMARK_2026-09-03.md §6 5순위).
 *
 * <p>발송 로직 자체(알림·검증)를 새로 만들지 않고 {@link ChatService#send} 를 그대로
 * 재사용한다 — 예약 메시지도 도착하면 평범한 메시지와 똑같이 취급돼야 하기 때문
 * (읽음 처리·리액션·답장·검색·북마크 전부 동일하게 동작해야 한다).
 */
@Service
@Transactional(readOnly = true)
public class ScheduledChatMessageService {

    /** 지원 타입 — {@link ScheduleMessageRequest} 클래스 주석 참고. */
    private static final Set<MessageType> SUPPORTED_TYPES =
            Set.of(MessageType.TEXT, MessageType.STICKER, MessageType.IMAGE);

    /** 관계당 대기 중 예약 개수 상한 — 실수로 반복 등록하는 버그/오조작 방어용, 정상 사용은 이 범위를 넘지 않는다. */
    private static final long MAX_PENDING_PER_RELATION = 20;

    private final ScheduledChatMessageRepository scheduledRepository;
    private final RelationRepository relationRepository;
    private final PlanGuard planGuard;

    public ScheduledChatMessageService(ScheduledChatMessageRepository scheduledRepository,
                                        RelationRepository relationRepository,
                                        PlanGuard planGuard) {
        this.scheduledRepository = scheduledRepository;
        this.relationRepository = relationRepository;
        this.planGuard = planGuard;
    }

    @Transactional
    public ScheduledMessageResponse schedule(Long userId, Long relationId, ScheduleMessageRequest req) {
        requireMember(userId, relationId);

        MessageType type = req.messageType() != null ? req.messageType() : MessageType.TEXT;
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이 종류의 메시지는 예약 전송할 수 없어요.");
        }
        if (req.scheduledAt() == null || !req.scheduledAt().isAfter(LocalDateTime.now())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "예약 시각은 지금보다 뒤여야 해요.");
        }
        if (type == MessageType.STICKER && StickerPack.isPremium(req.content())) {
            // 발송 시점(ChatService.send)에서도 다시 검사한다 — 예약 뒤 강등되는 경우 대비.
            planGuard.require(userId, Feature.PREMIUM_STICKER);
        }
        if (scheduledRepository.countByRelationIdAndSentAtIsNullAndCanceledAtIsNull(relationId)
                >= MAX_PENDING_PER_RELATION) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "대기 중인 예약 메시지가 너무 많아요. 먼저 정리해주세요.");
        }

        ScheduledChatMessage scheduled = ScheduledChatMessage.builder()
                .relationId(relationId)
                .senderId(userId)
                .messageType(type)
                .content(req.content())
                .imageUrl(req.imageUrl())
                .scheduledAt(req.scheduledAt())
                .build();
        scheduledRepository.save(scheduled);
        return ScheduledMessageResponse.from(scheduled);
    }

    public List<ScheduledMessageResponse> listPending(Long userId, Long relationId) {
        requireMember(userId, relationId);
        return scheduledRepository.findPending(relationId).stream()
                .map(ScheduledMessageResponse::from)
                .toList();
    }

    /** 취소 — 예약한 본인만, 발송 전에만 가능. */
    @Transactional
    public void cancel(Long userId, Long scheduledId) {
        ScheduledChatMessage scheduled = scheduledRepository.findById(scheduledId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!scheduled.getSenderId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (!scheduled.isPending()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 발송되었거나 취소된 예약이에요.");
        }
        scheduled.cancel();
    }

    private void requireMember(Long userId, Long relationId) {
        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (!relation.involves(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        if (!relation.isActive()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_ACTIVE);
        }
    }
}
