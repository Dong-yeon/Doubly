package com.fitto.common.plan;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationMember;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationMemberRepository;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * "이 사람(또는 이 커플)은 지금 무슨 플랜인가" — 판정의 단일 출처.
 *
 * <p>구독은 사용자에 붙지만, 커플 공간의 등급은 <b>두 사람 중 높은 쪽</b>이다
 * ({@link Feature#isCoupleScoped()}). 콘텐츠가 {@code couple_id} 에 매달려 있어서
 * 개인 단위로 판정하면 같은 여행·피드를 한 명은 보고 한 명은 못 보는 상태가 되기 때문이다.
 * 대신 <b>커플당 결제 1건</b>이 정상 상태이므로, 가격은 1인이 아니라 커플 기준으로 잡아야 한다.
 */
@Component
public class PlanResolver {

    private final PlanProperties properties;
    private final SubscriptionRepository subscriptionRepository;
    private final RelationRepository relationRepository;
    private final RelationMemberRepository relationMemberRepository;
    private final UserRepository userRepository;

    public PlanResolver(PlanProperties properties,
                        SubscriptionRepository subscriptionRepository,
                        RelationRepository relationRepository,
                        RelationMemberRepository relationMemberRepository,
                        UserRepository userRepository) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.relationRepository = relationRepository;
        this.relationMemberRepository = relationMemberRepository;
        this.userRepository = userRepository;
    }

    /** 전역 무료 체험 플래그 — 켜져 있으면 <b>전원</b>이 PRO 다(출시 초기). */
    public boolean isFreeTrial() {
        return properties.isFreeTrial();
    }

    /**
     * 이 사람이 지금 체험 중인가 — 앱의 "체험 중" 배지.
     *
     * <p>두 가지가 합쳐져 있다: 전역 플래그(출시 초기, 전원)와 <b>가입 후 N일</b>
     * ({@code fitto.plan.trial-days}). 앱 입장에서는 둘 다 "아직 돈 낼 때가 아니다"로
     * 같은 뜻이라 한 값으로 내린다.
     */
    @Transactional(readOnly = true)
    public boolean isInTrial(Long userId) {
        return properties.isFreeTrial() || inTrial(List.of(userId));
    }

    /**
     * 이 사람의 체험이 끝나는 시각 — 앱이 "체험 D-2" 를 그리는 데 쓴다.
     *
     * <p>전역 플래그가 켜져 있으면 {@code null} 이다. 끝이 정해져 있지 않기 때문이다 —
     * 여기에 임의의 날짜를 만들어 주면 앱이 없는 마감을 안내하게 된다.
     */
    @Transactional(readOnly = true)
    public LocalDateTime trialEndsAt(Long userId) {
        return properties.isFreeTrial() ? null : trialEndOf(List.of(userId));
    }

    /** 개인 플랜. */
    @Transactional(readOnly = true)
    public Plan resolve(Long userId) {
        if (properties.isFreeTrial()) {
            return Plan.PRO;
        }
        return highestOf(List.of(userId));
    }

    /**
     * 관계(커플·가족) 플랜 = 멤버 중 가장 높은 등급.
     *
     * <p>A/B 슬롯과 {@code relation_members} 를 함께 본다 — FAMILY 는 3번째 이후 멤버가
     * A/B 컬럼에 없다.
     */
    @Transactional(readOnly = true)
    public Plan resolveForRelation(Long relationId) {
        if (properties.isFreeTrial()) {
            return Plan.PRO;
        }
        List<Long> memberIds = memberIdsOf(relationId);
        return memberIds.isEmpty() ? Plan.FREE : highestOf(memberIds);
    }

    /**
     * 기능 성격에 맞는 플랜.
     *
     * <p>커플 기능이면 활성 커플 관계의 등급으로, 개인 기능이면 본인 등급으로 판정한다.
     * 커플이 연결되지 않았으면 본인 등급으로 떨어진다(혼자 쓰는 동안에도 앱은 동작해야 한다).
     */
    @Transactional(readOnly = true)
    public Plan resolveFor(Long userId, Feature feature) {
        if (properties.isFreeTrial()) {
            return Plan.PRO;
        }
        if (!feature.isCoupleScoped()) {
            return highestOf(List.of(userId));
        }
        return activeCoupleIdOf(userId)
                .map(this::resolveForRelation)
                .orElseGet(() -> highestOf(List.of(userId)));
    }

    /**
     * 이 사용자의 활성 커플 관계 id — 없으면 비어 있다(혼자 쓰는 중).
     *
     * <p>{@link PlanGuard} 가 <b>사용량을 어느 주머니에서 셀지</b> 정할 때 쓴다. 판정과
     * 계측이 같은 관계를 봐야 "둘 다 PRO 인데 한 명만 막힌다" 같은 어긋남이 안 생긴다.
     */
    @Transactional(readOnly = true)
    public java.util.Optional<Long> activeCoupleIdOf(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream()
                .findFirst()
                .map(Relation::getId);
    }

    private List<Long> memberIdsOf(Long relationId) {
        Set<Long> ids = new LinkedHashSet<>();
        relationRepository.findById(relationId).ifPresent(relation -> {
            if (relation.getUserAId() != null) ids.add(relation.getUserAId());
            if (relation.getUserBId() != null) ids.add(relation.getUserBId());
        });
        relationMemberRepository.findByRelationIdOrderByJoinedAtAscIdAsc(relationId)
                .stream()
                .map(RelationMember::getUserId)
                .forEach(ids::add);
        return new ArrayList<>(ids);
    }

    /** 한 번의 질의로 여러 사용자를 보고 가장 높은 등급을 고른다 (N+1 방지). */
    private Plan highestOf(List<Long> userIds) {
        if (userIds.isEmpty()) {
            return Plan.FREE;
        }
        /*
         * 체험을 구독보다 먼저 본다 — 체험 중이면 구독 조회가 통째로 불필요하고,
         * 가입 직후에는 어차피 구독이 없다. 반대로 체험이 지난 사람은 두 질의를 다 타는데,
         * 둘 다 인덱스 조회(PK / user_id+status)라 비용이 크지 않다.
         */
        if (inTrial(userIds)) {
            return Plan.PRO;
        }
        return subscriptionRepository.findEffective(userIds, LocalDateTime.now())
                .stream()
                .map(Subscription::getPlan)
                .reduce(Plan.FREE, Plan::max);
    }

    /** 이 사람들 중 누구라도 아직 체험 기간 안인가. */
    private boolean inTrial(List<Long> userIds) {
        LocalDateTime endsAt = trialEndOf(userIds);
        return endsAt != null && endsAt.isAfter(LocalDateTime.now());
    }

    /**
     * 체험이 끝나는 시각 = <b>가장 늦게 가입한 사람</b>의 가입 시각 + trialDays.
     *
     * <p>커플에서 나중에 들어온 쪽 기준인 것은 "둘 중 높은 등급" 규칙과 같은 방향이다 —
     * 한 명의 체험이 끝났다고 공동 콘텐츠가 반쪽만 잠기면 안 된다.
     *
     * <p>{@code trialDays <= 0}(체험 없음)이거나 대상이 없으면 null.
     */
    private LocalDateTime trialEndOf(List<Long> userIds) {
        int days = properties.getTrialDays();
        if (days <= 0 || userIds.isEmpty()) {
            return null;
        }
        LocalDateTime latestJoin = userRepository.findLatestCreatedAt(userIds);
        return latestJoin == null ? null : latestJoin.plusDays(days);
    }
}
