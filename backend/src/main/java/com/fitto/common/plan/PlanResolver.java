package com.fitto.common.plan;

import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationMember;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationMemberRepository;
import com.fitto.relation.repository.RelationRepository;
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

    public PlanResolver(PlanProperties properties,
                        SubscriptionRepository subscriptionRepository,
                        RelationRepository relationRepository,
                        RelationMemberRepository relationMemberRepository) {
        this.properties = properties;
        this.subscriptionRepository = subscriptionRepository;
        this.relationRepository = relationRepository;
        this.relationMemberRepository = relationMemberRepository;
    }

    /** 무료 체험 기간인가 — 앱의 "체험 중" 배지 표시에 쓴다. */
    public boolean isFreeTrial() {
        return properties.isFreeTrial();
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

    private java.util.Optional<Long> activeCoupleIdOf(Long userId) {
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
        return subscriptionRepository.findEffective(userIds, LocalDateTime.now())
                .stream()
                .map(Subscription::getPlan)
                .reduce(Plan.FREE, Plan::max);
    }
}
