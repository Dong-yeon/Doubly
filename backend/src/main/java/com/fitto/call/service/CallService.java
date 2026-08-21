package com.fitto.call.service;

import com.fitto.call.StreamTokenProperties;
import com.fitto.call.StreamTokenService;
import com.fitto.call.domain.CallSession;
import com.fitto.call.domain.CallStatus;
import com.fitto.call.domain.CallType;
import com.fitto.call.dto.CallJoinResponse;
import com.fitto.call.dto.CallSessionResponse;
import com.fitto.call.dto.StartCallRequest;
import com.fitto.call.dto.StreamCredentialsResponse;
import com.fitto.call.repository.CallSessionRepository;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 통화 — PLAN.md "통화·영상통화" 1단계. Doubly 백엔드는 미디어를 다루지 않는다:
 * "누가 누구에게 걸었는지"만 중개(세션 생성·Stream 토큰 발급·커플 이벤트·알림)하고,
 * 실제 오디오/비디오·벨(ring) 신호는 Stream Video 가 전담한다.
 *
 * <p>벨 웨이크업(앱 종료 상태) 검증은 claude/call-spike-android 브랜치의 스파이크
 * (docs/CALL_SPIKE.md)가 담당했고, Firebase 연동은 2단계에서 붙는다. 그 전까지
 * 백그라운드 수신자에게는 기존 Expo 푸시가 임시 알림 역할을 한다(탭 → 앱 열기).
 */
@Service
@Transactional(readOnly = true)
public class CallService {

    /** 벨 울림·통화 중 — "이미 통화가 진행 중" 판정에 쓰는 활성 상태 묶음. */
    private static final List<CallStatus> ACTIVE_STATUSES = List.of(CallStatus.RINGING, CallStatus.ONGOING);

    private final CallSessionRepository callSessionRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final StreamTokenService tokenService;
    private final StreamTokenProperties streamProperties;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public CallService(CallSessionRepository callSessionRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       StreamTokenService tokenService,
                       StreamTokenProperties streamProperties,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher) {
        this.callSessionRepository = callSessionRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.tokenService = tokenService;
        this.streamProperties = streamProperties;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** StreamVideoClient 초기화용 자격 — 로그인 직후 1회. 연결돼 있어야 벨을 받는다. */
    public StreamCredentialsResponse credentials(Long userId) {
        requireConfigured();
        return new StreamCredentialsResponse(
                streamProperties.getApiKey(), String.valueOf(userId), tokenService.createToken(userId));
    }

    /** 발신 — RINGING 세션 생성 + 발신자용 Stream 자격 반환 + 상대에게 이벤트·푸시. */
    @Transactional
    public CallJoinResponse start(Long userId, StartCallRequest req) {
        requireConfigured();
        Relation couple = activeCouple(userId);
        Long calleeId = couple.partnerOf(userId);
        if (calleeId == null) {
            throw new BusinessException(ErrorCode.RELATION_NOT_FOUND, "커플 연결 후 사용할 수 있는 기능이에요.");
        }
        if (callSessionRepository.existsByCoupleIdAndStatusIn(couple.getId(), ACTIVE_STATUSES)) {
            throw new BusinessException(ErrorCode.CALL_ALREADY_ACTIVE);
        }

        CallSession session = callSessionRepository.save(CallSession.builder()
                .coupleId(couple.getId())
                .callerId(userId)
                .calleeId(calleeId)
                .callType(req.callType())
                .providerCallId("doubly-" + UUID.randomUUID())
                .build());

        // 포그라운드 최단 경로 — 수신측은 이벤트를 받으면 GET /calls/{id} 로 다시 조회한다
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CALL_INCOMING);
        // 임시 백그라운드 알림(2단계에서 Stream 링잉 푸시가 벨을 담당하면 보조 역할로 남는다)
        String kind = req.callType() == CallType.VIDEO ? "영상통화" : "음성통화";
        notificationService.notify(calleeId, "전화", userName(userId) + "님이 " + kind + "를 걸었어요 📞");

        return joinResponse(session, userId);
    }

    /** 수신자 수락 — ONGOING 전환 + 수신자용 Stream 자격 반환. */
    @Transactional
    public CallJoinResponse accept(Long userId, Long callId) {
        requireConfigured();
        CallSession session = memberSession(userId, callId);
        if (!session.getCalleeId().equals(userId) || session.getStatus() != CallStatus.RINGING) {
            throw new BusinessException(ErrorCode.CALL_INVALID_STATE);
        }
        session.accept(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        return joinResponse(session, userId);
    }

    /** 수신자 거절 — 발신자 화면은 CALL_UPDATED 이벤트로 즉시 닫힌다. */
    @Transactional
    public CallSessionResponse decline(Long userId, Long callId) {
        CallSession session = memberSession(userId, callId);
        if (!session.getCalleeId().equals(userId) || session.getStatus() != CallStatus.RINGING) {
            throw new BusinessException(ErrorCode.CALL_INVALID_STATE);
        }
        session.decline(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        return CallSessionResponse.from(session);
    }

    /**
     * 종료 — 양쪽 다 호출할 수 있다. 통화 중이었으면 ENDED(통화시간 기록),
     * 아무도 수락하지 않은 채 발신자가 끊으면 MISSED(수신자에게 부재중 알림).
     * 이미 끝난 세션이면 그대로 반환한다 — 양쪽이 동시에 종료를 눌러도 에러가 아니다.
     */
    @Transactional
    public CallSessionResponse end(Long userId, Long callId) {
        CallSession session = memberSession(userId, callId);
        if (session.getStatus().isTerminal()) {
            return CallSessionResponse.from(session);
        }
        boolean wasRinging = session.getStatus() == CallStatus.RINGING;
        session.end(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        if (wasRinging) {
            notificationService.notify(session.getCalleeId(), "부재중 전화",
                    userName(session.getCallerId()) + "님의 전화를 놓쳤어요");
        }
        return CallSessionResponse.from(session);
    }

    /** 통화 기록 — 최신순, cursor(마지막으로 본 id) 페이징. */
    public List<CallSessionResponse> list(Long userId, Long cursor) {
        Relation couple = activeCouple(userId);
        List<CallSession> sessions = cursor == null
                ? callSessionRepository.findTop30ByCoupleIdOrderByIdDesc(couple.getId())
                : callSessionRepository.findTop30ByCoupleIdAndIdLessThanOrderByIdDesc(couple.getId(), cursor);
        return sessions.stream().map(CallSessionResponse::from).toList();
    }

    /** 세션 단건 — CALL_INCOMING 이벤트를 받은 수신측이 벨 화면을 그릴 때 조회한다. */
    public CallSessionResponse get(Long userId, Long callId) {
        return CallSessionResponse.from(memberSession(userId, callId));
    }

    private CallJoinResponse joinResponse(CallSession session, Long userId) {
        return new CallJoinResponse(
                session.getId(),
                session.getProviderCallId(),
                streamProperties.getApiKey(),
                tokenService.createToken(userId));
    }

    /** 통화 당사자만 세션에 접근할 수 있다 — 커플 스코프 검증을 겸한다. */
    private CallSession memberSession(Long userId, Long callId) {
        CallSession session = callSessionRepository.findById(callId)
                .orElseThrow(() -> new BusinessException(ErrorCode.CALL_NOT_FOUND));
        if (!session.isMember(userId)) {
            throw new BusinessException(ErrorCode.CALL_NOT_FOUND);
        }
        return session;
    }

    private void requireConfigured() {
        if (!tokenService.isConfigured()) {
            throw new BusinessException(ErrorCode.STREAM_NOT_CONFIGURED);
        }
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("상대방");
    }
}
