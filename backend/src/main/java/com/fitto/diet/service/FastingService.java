package com.fitto.diet.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.diet.domain.FastingPlan;
import com.fitto.diet.domain.FastingSession;
import com.fitto.diet.dto.FastingStatusResponse;
import com.fitto.diet.dto.PartnerFastingResponse;
import com.fitto.diet.dto.StartFastingRequest;
import com.fitto.diet.repository.FastingSessionRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 간헐적 단식 타이머 — YAZIO 의 핵심 차별기능이지만, Doubly 는 "혼자 타이머 맞추기"가 아니라
 * 커플이 서로의 진행 상태를 볼 수 있게 만든다({@link #partner}). 세션이 서버에 살아있으므로
 * 워크아웃 라이브 세션과 같은 패턴으로 상대 화면에 실시간 반영할 수 있다.
 */
@Service
@Transactional(readOnly = true)
public class FastingService {

    private final FastingSessionRepository repository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final CoupleEventPublisher coupleEventPublisher;
    private final NotificationService notificationService;

    public FastingService(FastingSessionRepository repository, RelationRepository relationRepository,
                          UserRepository userRepository, CoupleEventPublisher coupleEventPublisher,
                          NotificationService notificationService) {
        this.repository = repository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.notificationService = notificationService;
    }

    @Transactional
    public FastingStatusResponse start(Long userId, StartFastingRequest req) {
        if (repository.existsByUserIdAndEndedAtIsNull(userId)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이미 진행 중인 단식이 있어요.");
        }
        int hours = resolveHours(req);
        LocalDateTime now = LocalDateTime.now();
        FastingSession session = FastingSession.builder()
                .userId(userId).planType(req.planType()).targetHours(hours).startedAt(now).build();
        repository.save(session);

        notifyCouple(userId, "간헐적 단식을 시작했어요!",
                hours + "시간 목표로 공복을 시작했어요 ⏱️", CoupleEvent.FASTING);
        return toStatus(session, now, true);
    }

    @Transactional
    public FastingStatusResponse end(Long userId) {
        FastingSession session = repository.findByUserIdAndEndedAtIsNull(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "진행 중인 단식이 없어요."));
        LocalDateTime now = LocalDateTime.now();
        session.end(now);
        FastingStatusResponse status = toStatus(session, now, false);

        if (status.achieved()) {
            notifyCouple(userId, "목표 시간을 채웠어요! 🎉",
                    status.targetHours() + "시간 단식에 성공했어요!", CoupleEvent.FASTING);
        } else {
            coupleEventPublisher.publish(coupleIdOf(userId), CoupleEvent.FASTING);
        }
        return status;
    }

    public FastingStatusResponse active(Long userId) {
        return repository.findByUserIdAndEndedAtIsNull(userId)
                .map(s -> toStatus(s, LocalDateTime.now(), true))
                .orElseGet(FastingStatusResponse::inactive);
    }

    /** 커플 상대방의 진행 상태 — {@code MealService.partnerToday} 와 같은 조회 패턴. */
    public PartnerFastingResponse partner(Long userId) {
        List<Relation> couples = relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE);
        if (couples.isEmpty()) {
            return new PartnerFastingResponse(false, null, false, null, null);
        }
        Long partnerId = couples.get(0).partnerOf(userId);
        if (partnerId == null) {
            return new PartnerFastingResponse(false, null, false, null, null);
        }
        String partnerName = userRepository.findById(partnerId).map(u -> u.getName()).orElse(null);
        return repository.findByUserIdAndEndedAtIsNull(partnerId)
                .map(s -> new PartnerFastingResponse(true, partnerName, true,
                        (int) Duration.between(s.getStartedAt(), LocalDateTime.now()).toMinutes(), s.getTargetHours()))
                .orElseGet(() -> new PartnerFastingResponse(true, partnerName, false, null, null));
    }

    private int resolveHours(StartFastingRequest req) {
        if (req.planType() == FastingPlan.CUSTOM) {
            if (req.targetHours() == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "목표 시간을 입력해주세요.");
            }
            return req.targetHours();
        }
        return req.targetHours() != null ? req.targetHours() : req.planType().defaultHours();
    }

    private FastingStatusResponse toStatus(FastingSession s, LocalDateTime now, boolean active) {
        int targetMin = s.getTargetHours() * 60;
        int elapsedMin = (int) Duration.between(s.getStartedAt(), now).toMinutes();
        int remainingMin = targetMin - elapsedMin;
        boolean achieved = elapsedMin >= targetMin;
        double progressPct = Math.min(100.0, elapsedMin * 100.0 / targetMin);
        return new FastingStatusResponse(active, s.getPlanType(), s.getPlanType().label(), s.getTargetHours(),
                s.getStartedAt(), elapsedMin, remainingMin, achieved, progressPct);
    }

    /** 커플 실시간 반영 + 응원 푸시 — 관계가 없으면 조용히 지나간다. */
    private void notifyCouple(Long userId, String title, String bodySuffix, String eventType) {
        relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .ifPresent(c -> {
                    coupleEventPublisher.publish(c.getId(), eventType);
                    Long partnerId = c.partnerOf(userId);
                    if (partnerId != null) {
                        String myName = userRepository.findById(userId).map(u -> u.getName()).orElse("상대방");
                        notificationService.notify(partnerId, NotificationCategory.PARTNER,
                                title, myName + "님이 " + bodySuffix, PushLinks.DIET);
                    }
                });
    }

    private Long coupleIdOf(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst().map(Relation::getId).orElse(null);
    }
}
