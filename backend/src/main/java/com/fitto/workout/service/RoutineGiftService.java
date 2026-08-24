package com.fitto.workout.service;

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
import com.fitto.workout.domain.RoutineGift;
import com.fitto.workout.domain.RoutineGiftStatus;
import com.fitto.workout.domain.WorkoutRoutine;
import com.fitto.workout.dto.RoutineGiftResponse;
import com.fitto.workout.dto.RoutineResponse;
import com.fitto.workout.repository.RoutineGiftRepository;
import com.fitto.workout.repository.WorkoutRoutineRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * 커플 루틴 선물하기 — 내 운동 루틴을 애인에게 보내고, 애인이 수락하면 애인 루틴 목록에
 * 그대로 추가된다. 실제 딥카피는 {@link WorkoutRoutineService#deepCopy} 를 그대로 재사용한다
 * (시스템 템플릿 복사와 같은 방침: 무게는 개인차가 커서 담지 않는다).
 *
 * <p>전송 즉시 스냅샷을 뜨는 이유: 보낸 사람이 원본 루틴을 나중에 고치거나(스마트 루틴 동기화)
 * 지워도 이미 보낸 선물 내용은 바뀌면 안 된다.
 */
@Service
@Transactional(readOnly = true)
public class RoutineGiftService {

    private static final int GIFT_PAGE_SIZE = 30;

    private final RoutineGiftRepository giftRepository;
    private final WorkoutRoutineRepository routineRepository;
    private final WorkoutRoutineService workoutRoutineService;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final PlanGuard planGuard;

    public RoutineGiftService(RoutineGiftRepository giftRepository,
                              WorkoutRoutineRepository routineRepository,
                              WorkoutRoutineService workoutRoutineService,
                              RelationRepository relationRepository,
                              UserRepository userRepository,
                              NotificationService notificationService,
                              CoupleEventPublisher coupleEventPublisher,
                              PlanGuard planGuard) {
        this.giftRepository = giftRepository;
        this.routineRepository = routineRepository;
        this.workoutRoutineService = workoutRoutineService;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.planGuard = planGuard;
    }

    /** 내 루틴을 애인에게 선물 — 전송 즉시 스냅샷을 떠 원본과 분리한다. */
    @Transactional
    public RoutineGiftResponse send(Long senderId, Long routineId, String message) {
        WorkoutRoutine source = routineRepository.findByIdAndUserId(routineId, senderId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        Relation relation = activeCoupleRelation(senderId);
        Long receiverId = relation.partnerOf(senderId);

        WorkoutRoutine snapshot = workoutRoutineService.deepCopy(source, null);
        routineRepository.save(snapshot);

        RoutineGift gift = RoutineGift.builder()
                .relationId(relation.getId())
                .senderId(senderId)
                .receiverId(receiverId)
                .snapshotRoutineId(snapshot.getId())
                .message(trimToNull(message))
                .build();
        giftRepository.save(gift);

        String senderName = userName(senderId);
        notificationService.notify(receiverId, NotificationCategory.PARTNER,
                "운동 루틴을 선물했어요 🎁", senderName + " — " + source.getTitle(),
                PushLinks.WORKOUT_ROUTINES);
        coupleEventPublisher.publish(relation.getId(), CoupleEvent.ROUTINE_GIFT);
        return RoutineGiftResponse.of(gift, RoutineResponse.of(snapshot), senderName, userName(receiverId));
    }

    /** 받은 선물 목록 — 최근 순 (PENDING 도 ACCEPTED/DECLINED 도 함께 보여준다) */
    public List<RoutineGiftResponse> received(Long userId) {
        return toResponses(giftRepository.findByReceiverIdOrderByIdDesc(userId, PageRequest.of(0, GIFT_PAGE_SIZE)));
    }

    /** 보낸 선물 목록 — 최근 순 */
    public List<RoutineGiftResponse> sent(Long userId) {
        return toResponses(giftRepository.findBySenderIdOrderByIdDesc(userId, PageRequest.of(0, GIFT_PAGE_SIZE)));
    }

    /** 수락 — 스냅샷을 내 소유로 다시 복사, 플랜 한도는 기존 루틴 저장과 동일하게 적용된다. */
    @Transactional
    public RoutineGiftResponse accept(Long receiverId, Long giftId) {
        RoutineGift gift = getReceivable(receiverId, giftId);
        requireActiveRelation(gift.getRelationId());

        WorkoutRoutine snapshot = routineRepository.findById(gift.getSnapshotRoutineId())
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        planGuard.requireCapacity(receiverId, Feature.WORKOUT_ROUTINE, routineRepository.countByUserId(receiverId));
        WorkoutRoutine copy = workoutRoutineService.deepCopy(snapshot, receiverId);
        routineRepository.save(copy);

        gift.accept(copy.getId());
        String receiverName = userName(receiverId);
        notificationService.notify(gift.getSenderId(), NotificationCategory.PARTNER,
                "루틴을 받았어요!", receiverName + "님이 선물을 받았어요 💪", PushLinks.WORKOUT_ROUTINES);
        coupleEventPublisher.publish(gift.getRelationId(), CoupleEvent.ROUTINE_GIFT);
        return RoutineGiftResponse.of(gift, RoutineResponse.of(copy), userName(gift.getSenderId()), receiverName);
    }

    /**
     * 거절 — 상태만 바꾼다. 보낸 사람에게는 알리지 않는다: 커플 사이에서 "거절당했다" 푸시는
     * 불필요한 마찰을 만들 수 있어, 보낸 사람은 "보낸 선물" 목록에서 상태로만 확인한다.
     */
    @Transactional
    public void decline(Long receiverId, Long giftId) {
        getReceivable(receiverId, giftId).decline();
    }

    // ---- helpers ----

    private Relation activeCoupleRelation(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream()
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_ACTIVE, "연결된 애인이 없어요."));
    }

    /**
     * 관계가 끊긴 뒤에도 PENDING 선물이 남아있을 수 있다 — Relation.involves() 만으로는
     * 종료 후 접근을 막지 못하므로(Relation.isActive() 주석 참고) 반드시 별도로 확인한다.
     */
    private void requireActiveRelation(Long relationId) {
        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (!relation.isActive()) {
            throw new BusinessException(ErrorCode.RELATION_NOT_ACTIVE);
        }
    }

    private RoutineGift getReceivable(Long receiverId, Long giftId) {
        RoutineGift gift = giftRepository.findByIdAndReceiverId(giftId, receiverId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GIFT_NOT_FOUND));
        if (gift.getStatus() != RoutineGiftStatus.PENDING) {
            throw new BusinessException(ErrorCode.GIFT_ALREADY_RESPONDED);
        }
        return gift;
    }

    /** 미리보기용 루틴 + 상대 이름을 배치 조회로 한 번에 채운다 (N+1 방지). */
    private List<RoutineGiftResponse> toResponses(List<RoutineGift> gifts) {
        if (gifts.isEmpty()) {
            return List.of();
        }
        List<Long> routineIds = gifts.stream()
                .map(g -> g.getResultingRoutineId() != null ? g.getResultingRoutineId() : g.getSnapshotRoutineId())
                .distinct()
                .toList();
        Map<Long, WorkoutRoutine> routines = routineRepository.findAllById(routineIds).stream()
                .collect(Collectors.toMap(WorkoutRoutine::getId, Function.identity()));

        List<Long> userIds = gifts.stream()
                .flatMap(g -> Stream.of(g.getSenderId(), g.getReceiverId()))
                .distinct()
                .toList();
        Map<Long, String> names = userRepository.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, User::getName));

        return gifts.stream()
                .map(g -> {
                    Long routineId = g.getResultingRoutineId() != null ? g.getResultingRoutineId() : g.getSnapshotRoutineId();
                    WorkoutRoutine routine = routines.get(routineId);
                    return RoutineGiftResponse.of(g, routine != null ? RoutineResponse.of(routine) : null,
                            names.get(g.getSenderId()), names.get(g.getReceiverId()));
                })
                .toList();
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("애인");
    }

    private static String trimToNull(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }
}
