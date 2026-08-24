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
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 통화 — PLAN.md "통화·영상통화". Doubly 백엔드는 미디어를 다루지 않는다:
 * "누가 누구에게 걸었는지"만 중개(세션 생성·Stream 토큰 발급·커플 이벤트·알림)하고,
 * 실제 오디오/비디오·벨(ring) 신호는 Stream Video 가 전담한다.
 *
 * <p><b>네이티브 벨 웨이크업(CallKit/VoIP push)은 없다.</b> 대신 통화가 끝날 때마다
 * 채팅에 결과 카드를 남긴다(정상 종료/부재중/거절 — {@link #recordOutcome}) — 앱이 꺼져
 * 있어도 오는 기존 채팅 알림 경로를 그대로 타므로, "부재중 전화, 다시 걸어주세요"를
 * 별도 네이티브 인프라 없이 전달할 수 있다. 못 받은 벨(30초, {@link CallSessionSweeper})
 * 은 이 카드가 곧 유일한 통지 수단이다.
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
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final PlanGuard planGuard;
    private final CallMinuteGuard callMinuteGuard;

    public CallService(CallSessionRepository callSessionRepository,
                       RelationRepository relationRepository,
                       UserRepository userRepository,
                       StreamTokenService tokenService,
                       StreamTokenProperties streamProperties,
                       NotificationService notificationService,
                       CoupleEventPublisher coupleEventPublisher,
                       ChatService chatService,
                       SimpMessagingTemplate messagingTemplate,
                       PlanGuard planGuard,
                       CallMinuteGuard callMinuteGuard) {
        this.callSessionRepository = callSessionRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.tokenService = tokenService;
        this.streamProperties = streamProperties;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
        this.planGuard = planGuard;
        this.callMinuteGuard = callMinuteGuard;
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
        // 영상통화는 PRO 전용 — 비트윈에도 없는 차별화 지점(docs/PRO_PLAN_DESIGN.md 참고).
        // 음성통화는 게이팅 없이 전면 무료라 여기서 걸리지 않는다.
        if (req.callType() == CallType.VIDEO) {
            planGuard.require(userId, Feature.VIDEO_CALL);
        }
        // 통화 종류와 무관한 안전망 — Stream Video 무료 티어를 소수가 독식하는 걸 막는다.
        callMinuteGuard.requireCapacity(couple.getId());

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
        notificationService.notify(calleeId, NotificationCategory.CHAT, "전화",
                userName(userId) + "님이 " + kind + "를 걸었어요 📞",
                PushLinks.chat(session.getCoupleId()));

        return joinResponse(session, userId);
    }

    /** 수신자 수락 — ONGOING 전환 + 수신자용 Stream 자격 반환. */
    @Transactional
    public CallJoinResponse accept(Long userId, String providerCallId) {
        requireConfigured();
        CallSession session = memberSession(userId, providerCallId);
        if (!session.getCalleeId().equals(userId) || session.getStatus() != CallStatus.RINGING) {
            throw new BusinessException(ErrorCode.CALL_INVALID_STATE);
        }
        session.accept(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        return joinResponse(session, userId);
    }

    /** 수신자 거절 — 발신자 화면은 CALL_UPDATED 이벤트로 즉시 닫힌다. */
    @Transactional
    public CallSessionResponse decline(Long userId, String providerCallId) {
        CallSession session = memberSession(userId, providerCallId);
        if (!session.getCalleeId().equals(userId) || session.getStatus() != CallStatus.RINGING) {
            throw new BusinessException(ErrorCode.CALL_INVALID_STATE);
        }
        session.decline(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        recordOutcome(session);
        return CallSessionResponse.from(session);
    }

    /**
     * 종료 — 양쪽 다 호출할 수 있다(발신자의 응답 대기 취소도 포함). 통화 중이었으면
     * ENDED(통화시간 기록), 아무도 수락하지 않은 채 끝나면 MISSED. 이미 끝난 세션이면
     * 그대로 반환한다 — 양쪽이 동시에 종료를 눌러도 에러가 아니다.
     */
    @Transactional
    public CallSessionResponse end(Long userId, String providerCallId) {
        CallSession session = memberSession(userId, providerCallId);
        if (session.getStatus().isTerminal()) {
            return CallSessionResponse.from(session);
        }
        session.end(LocalDateTime.now());
        coupleEventPublisher.publish(session.getCoupleId(), CoupleEvent.CALL_UPDATED);
        recordOutcome(session);
        return CallSessionResponse.from(session);
    }

    /**
     * 통화가 최종 상태(ENDED/MISSED/DECLINED)로 정리된 뒤 공통 후처리 — 채팅방에 결과
     * 카드를 남기고(발신자 명의), <b>부재중일 때만</b> 알림을 보낸다. 정상 종료·거절은
     * 당사자가 이미 아는 상황이라 알림 없이 기록만 남긴다(실제 전화 앱들의 관행과 동일).
     *
     * <p>{@link CallSessionSweeper} 도 30초 무응답 판정 뒤 이 메서드를 호출한다 —
     * 네이티브 벨이 없는 지금, 부재중 카드가 사실상 유일한 "전화 왔었다" 통지 수단이다.
     */
    void recordOutcome(CallSession session) {
        if (session.getDurationSec() != null) {
            // 실제 통화가 있었을 때만 안전망에 누적한다 — 벨만 울리다 끝난(MISSED) 세션은 0초.
            callMinuteGuard.record(session.getCoupleId(), session.getDurationSec());
        }
        String content = session.getCallType() + "|" + session.getStatus()
                + (session.getDurationSec() != null ? "|" + session.getDurationSec() : "");
        ChatMessageResponse saved = chatService.postSystemCard(
                session.getCallerId(), session.getCoupleId(), MessageType.CALL_CARD, content);
        messagingTemplate.convertAndSend("/sub/rooms/" + session.getCoupleId(), saved);

        if (session.getStatus() == CallStatus.MISSED) {
            notificationService.notify(session.getCalleeId(), NotificationCategory.CHAT, "부재중 전화",
                    userName(session.getCallerId()) + "님의 전화를 놓쳤어요. 채팅에서 다시 걸어보세요 📞",
                    PushLinks.chat(session.getCoupleId()));
        }
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
    public CallSessionResponse get(Long userId, String providerCallId) {
        return CallSessionResponse.from(memberSession(userId, providerCallId));
    }

    private CallJoinResponse joinResponse(CallSession session, Long userId) {
        return new CallJoinResponse(
                session.getId(),
                session.getProviderCallId(),
                streamProperties.getApiKey(),
                tokenService.createToken(userId));
    }

    /**
     * 통화 당사자만 세션에 접근할 수 있다 — 커플 스코프 검증을 겸한다.
     *
     * <p>키는 내부 PK가 아니라 {@code providerCallId}다. 발신자는 응답으로 내부 PK도
     * 받지만, 수신자는 Stream SDK({@code useCalls()})가 넘겨주는 {@code call.id}
     * (=provider_call_id)만 알 수 있다 — 양쪽이 공통으로 쓸 수 있는 키는 이것뿐이다.
     */
    private CallSession memberSession(Long userId, String providerCallId) {
        CallSession session = callSessionRepository.findByProviderCallId(providerCallId)
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
