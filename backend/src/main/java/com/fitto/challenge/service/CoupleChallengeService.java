package com.fitto.challenge.service;

import com.fitto.challenge.domain.ChallengeType;
import com.fitto.challenge.domain.CoupleChallenge;
import com.fitto.challenge.dto.ChallengeResponse;
import com.fitto.challenge.dto.CreateChallengeRequest;
import com.fitto.challenge.repository.CoupleChallengeRepository;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.diet.repository.MealRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.repository.WorkoutRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 커플 챌린지/대결 — 생성/조회/삭제. 점수는 기간 내 운동/식단 기록일 수로 실시간 집계.
 */
@Service
@Transactional(readOnly = true)
public class CoupleChallengeService {

    private final CoupleChallengeRepository challengeRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final WorkoutRepository workoutRepository;
    private final MealRepository mealRepository;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;

    public CoupleChallengeService(CoupleChallengeRepository challengeRepository,
                                  RelationRepository relationRepository,
                                  UserRepository userRepository,
                                  WorkoutRepository workoutRepository,
                                  MealRepository mealRepository,
                                  NotificationService notificationService,
                                  CoupleEventPublisher coupleEventPublisher) {
        this.challengeRepository = challengeRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.workoutRepository = workoutRepository;
        this.mealRepository = mealRepository;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    @Transactional
    public ChallengeResponse create(Long userId, CreateChallengeRequest req) {
        if (req.endDate().isBefore(req.startDate())) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "종료일은 시작일 이후여야 해요.");
        }
        Relation couple = activeCouple(userId);
        CoupleChallenge challenge = CoupleChallenge.builder()
                .coupleId(couple.getId())
                .type(req.type())
                .title(req.title().trim())
                .startDate(req.startDate())
                .endDate(req.endDate())
                .stake(req.stake())
                .createdBy(userId)
                .build();
        challengeRepository.save(challenge);

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, "커플 대결 신청!",
                    userName(userId) + " — " + challenge.getTitle() + " (" + req.type().label() + " 대결)",
                    Map.of("type", "challenge", "id", String.valueOf(challenge.getId())));
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CHALLENGE);
        return toResponse(challenge, userId, partnerId);
    }

    public List<ChallengeResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        Long partnerId = couple.partnerOf(userId);
        return challengeRepository.findByCoupleIdOrderByStartDateDescIdDesc(couple.getId()).stream()
                .map(c -> toResponse(c, userId, partnerId))
                .toList();
    }

    @Transactional
    public void delete(Long userId, Long challengeId) {
        Relation couple = activeCouple(userId);
        CoupleChallenge challenge = challengeRepository.findByIdAndCoupleId(challengeId, couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "대결을 찾을 수 없습니다."));
        challengeRepository.delete(challenge);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.CHALLENGE);
    }

    private ChallengeResponse toResponse(CoupleChallenge c, Long userId, Long partnerId) {
        int myCount = count(c.getType(), userId, c.getStartDate(), c.getEndDate());
        int partnerCount = partnerId != null ? count(c.getType(), partnerId, c.getStartDate(), c.getEndDate()) : 0;
        String leader = myCount == partnerCount ? "TIE" : (myCount > partnerCount ? "ME" : "PARTNER");
        boolean ended = KstClock.today().isAfter(c.getEndDate());
        String partnerName = partnerId != null ? userName(partnerId) : null;
        return new ChallengeResponse(c.getId(), c.getType(), c.getType().label(), c.getTitle(),
                c.getStartDate(), c.getEndDate(), c.getStake(), myCount, partnerCount, partnerName,
                ended, leader, c.getCreatedAt());
    }

    /** 기간 내 기록일 수(중복 제거) */
    private int count(ChallengeType type, Long userId, LocalDate start, LocalDate end) {
        return type == ChallengeType.WORKOUT
                ? workoutRepository.findWorkoutDates(userId, start, end).size()
                : mealRepository.findMealDates(userId, start, end).size();
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
