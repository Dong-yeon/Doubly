package com.fitto.streak.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.FeatureState;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.time.KstClock;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.streak.domain.Streak;
import com.fitto.streak.domain.StreakType;
import com.fitto.streak.dto.StreakRepairResponse;
import com.fitto.streak.repository.StreakRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * 스트릭 복구권 — 어제 하루를 놓쳐 끊긴 연속 기록을 이어붙인다 ({@link Feature#STREAK_REPAIR}).
 *
 * <p><b>왜 만드는가</b>: 스트릭은 하루 놓치면 0이 되고, 그 순간이 이탈이 가장 크게 나는
 * 지점이다. 복구권은 듀오링고가 검증한 전환 훅이면서, 방향이 <b>끊김의 처벌을 완화하는</b>
 * 쪽이라 이 앱의 강박 방지 원칙과도 부합한다(더 조이는 게 아니라 풀어주는 유료 기능).
 *
 * <p><b>복구권 1회는 "어제 하루"를 메운다.</b> 그날에 걸린 스트릭이 운동·식단·커플까지
 * 여러 개여도 한 번에 함께 되살린다. 종류마다 따로 쓰게 하면 하루를 놓친 대가로 복구권
 * 네 장을 쓰게 되는데, 그건 파는 쪽이 이득이지 사는 쪽에는 납득이 안 된다.
 *
 * <p>되살릴 수 있는 범위는 <b>내 개인 스트릭 + 우리 커플 스트릭</b>이다. 상대의 개인
 * 스트릭은 상대 것이라 건드리지 않는다(각자 자기 것을 되살린다).
 */
@Service
@Transactional(readOnly = true)
public class StreakRepairService {

    private final StreakRepository streakRepository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;

    public StreakRepairService(StreakRepository streakRepository,
                               RelationRepository relationRepository,
                               UserRepository userRepository,
                               PlanGuard planGuard,
                               NotificationService notificationService) {
        this.streakRepository = streakRepository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
    }

    /**
     * 지금 되살릴 게 있는지 — 화면이 스트릭 카드를 그릴 때마다 부른다.
     *
     * <p>402 를 던지지 않는다. 자동 조회에서 402 를 던지면 앱을 열 때마다 업그레이드 시트가
     * 뜬다({@code PlanGuard.allows} 주석과 같은 이유). 잠김은 {@code locked} 로 알린다.
     */
    public StreakRepairResponse status(Long userId) {
        LocalDate today = KstClock.today();
        List<Streak> repairable = repairableStreaks(userId, today);
        FeatureState state = planGuard.state(userId, Feature.STREAK_REPAIR);
        return new StreakRepairResponse(
                !repairable.isEmpty() && state.allowed(),
                repairable.stream().map(s -> label(s.getStreakType())).toList(),
                state.remaining(),
                // limit 0 = 그 플랜에서는 아예 막힌 기능(Quota.blocked). 한도 소진과 구분해야
                // 화면이 "업그레이드"와 "이번 달 다 썼어요"를 다르게 안내할 수 있다.
                state.limit() == 0,
                null);
    }

    /**
     * 복구권 사용 — 되살릴 게 없으면 <b>횟수를 쓰지 않고</b> 거절한다.
     *
     * <p>순서가 중요하다: 대상 확인 → 차감 → 되살리기. 먼저 차감하면 "되살릴 게 없는데
     * 복구권만 사라졌다"가 된다. {@code PlanGuard.consume} 은 선차감이라 되돌릴 수 없다.
     */
    @Transactional
    public StreakRepairResponse repair(Long userId) {
        LocalDate today = KstClock.today();
        List<Streak> targets = repairableStreaks(userId, today);
        if (targets.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "지금은 되살릴 스트릭이 없어요. 복구권은 하루만 비었을 때 쓸 수 있어요.");
        }

        planGuard.consume(userId, Feature.STREAK_REPAIR);

        List<String> repaired = new ArrayList<>();
        boolean coupleRepaired = false;
        for (Streak streak : targets) {
            if (!streak.repair(today)) continue;      // 동시 요청 등으로 상태가 바뀐 경우
            streakRepository.save(streak);
            repaired.add(label(streak.getStreakType()));
            coupleRepaired |= streak.getRelationId() != null;
        }

        if (coupleRepaired) {
            notifyPartner(userId, today);
        }

        FeatureState state = planGuard.state(userId, Feature.STREAK_REPAIR);
        return new StreakRepairResponse(false, repaired, state.remaining(), false,
                today.minusDays(1).toString());
    }

    /** 내 개인 스트릭 2종 + 우리 커플 스트릭 2종 중 어제 하루만 빈 것들. */
    private List<Streak> repairableStreaks(Long userId, LocalDate today) {
        List<Streak> result = new ArrayList<>();
        for (StreakType type : List.of(StreakType.PERSONAL, StreakType.PERSONAL_MEAL)) {
            streakRepository.findByUserIdAndStreakType(userId, type)
                    .filter(s -> s.isRepairable(today))
                    .ifPresent(result::add);
        }
        activeCouple(userId).ifPresent(couple -> {
            for (StreakType type : List.of(StreakType.COUPLE, StreakType.COUPLE_MEAL)) {
                streakRepository.findByRelationIdAndStreakType(couple.getId(), type)
                        .filter(s -> s.isRepairable(today))
                        .ifPresent(result::add);
            }
        });
        return result;
    }

    /**
     * 커플 스트릭은 둘의 기록이라 상대도 알아야 한다.
     * (내 개인 스트릭만 되살린 경우는 알리지 않는다 — 상대에게는 남의 숫자다)
     */
    private void notifyPartner(Long userId, LocalDate today) {
        activeCouple(userId).map(c -> c.partnerOf(userId)).ifPresent(partnerId ->
                notificationService.notify(partnerId, NotificationCategory.PARTNER,
                        "우리 스트릭을 살렸어요 🔥",
                        userName(userId) + "님이 복구권으로 " + today.minusDays(1).getMonthValue() + "월 "
                                + today.minusDays(1).getDayOfMonth() + "일을 메웠어요.",
                        PushLinks.HOME));
    }

    private Optional<Relation> activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst();
    }

    private String label(StreakType type) {
        return switch (type) {
            case PERSONAL -> "내 운동";
            case PERSONAL_MEAL -> "내 식단";
            case COUPLE -> "커플 운동";
            case COUPLE_MEAL -> "커플 식단";
        };
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("커플");
    }
}
