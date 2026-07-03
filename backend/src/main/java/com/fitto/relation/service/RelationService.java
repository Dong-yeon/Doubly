package com.fitto.relation.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 관계 서비스 — 설계서 3.2 / 4.3.
 * 커플 초대코드 생성·연결, 관계 조회/해제. (트레이너 관계는 phase 6~7)
 */
@Service
@Transactional(readOnly = true)
public class RelationService {

    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동 문자(I,O,0,1) 제외
    private static final int CODE_LENGTH = 6;
    private static final long CODE_TTL_HOURS = 24;

    private final SecureRandom random = new SecureRandom();
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final com.fitto.trainer.repository.TrainerProfileRepository trainerProfileRepository;
    private final com.fitto.common.event.CoupleEventPublisher coupleEventPublisher;

    public RelationService(RelationRepository relationRepository, UserRepository userRepository,
                           com.fitto.trainer.repository.TrainerProfileRepository trainerProfileRepository,
                           com.fitto.common.event.CoupleEventPublisher coupleEventPublisher) {
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.trainerProfileRepository = trainerProfileRepository;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /** 커플 초대코드 생성 — 6자리, 24시간 유효 (REL-01). */
    @Transactional
    public InviteCodeResponse createCoupleInvite(Long userId) {
        if (hasActiveCouple(userId)) {
            throw new BusinessException(ErrorCode.ALREADY_CONNECTED);
        }
        Relation relation = Relation.builder()
                .relationType(RelationType.COUPLE)
                .userAId(userId)
                .status(RelationStatus.PENDING)
                .inviteCode(generateUniqueCode())
                .codeExpiresAt(LocalDateTime.now().plusHours(CODE_TTL_HOURS))
                .build();
        relationRepository.save(relation);
        return new InviteCodeResponse(relation.getInviteCode(), relation.getCodeExpiresAt());
    }

    /** 초대코드로 커플 연결 (REL-02). */
    @Transactional
    public RelationResponse connectCouple(Long userId, String code) {
        Relation relation = relationRepository.findByInviteCode(code.trim().toUpperCase())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_CODE_INVALID));

        if (relation.getRelationType() != RelationType.COUPLE
                || relation.getStatus() != RelationStatus.PENDING) {
            throw new BusinessException(ErrorCode.INVITE_CODE_INVALID);
        }
        if (relation.isExpired()) {
            throw new BusinessException(ErrorCode.INVITE_CODE_EXPIRED);
        }
        if (relation.getUserAId().equals(userId)) {
            throw new BusinessException(ErrorCode.INVITE_CODE_INVALID, "본인이 생성한 코드로는 연결할 수 없습니다.");
        }
        if (hasActiveCouple(userId)) {
            throw new BusinessException(ErrorCode.ALREADY_CONNECTED);
        }

        relation.connect(userId);
        User partner = userRepository.findById(relation.getUserAId()).orElse(null);
        return RelationResponse.of(relation, partner);
    }

    /** 트레이너 회원 초대코드 생성 (REL-03) — 정원·수락 여부 확인. */
    @Transactional
    public InviteCodeResponse createTrainerInvite(Long trainerId) {
        com.fitto.trainer.domain.TrainerProfile profile = trainerProfileRepository.findByUserId(trainerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_A_TRAINER));
        if (!profile.isAccepting()) {
            throw new BusinessException(ErrorCode.TRAINER_NOT_ACCEPTING);
        }
        if (countActiveMembers(trainerId) >= profile.getMaxMembers()) {
            throw new BusinessException(ErrorCode.TRAINER_MEMBER_LIMIT);
        }
        Relation relation = Relation.builder()
                .relationType(RelationType.TRAINER_MEMBER)
                .userAId(trainerId)
                .status(RelationStatus.PENDING)
                .inviteCode(generateUniqueCode())
                .codeExpiresAt(LocalDateTime.now().plusHours(CODE_TTL_HOURS))
                .build();
        relationRepository.save(relation);
        return new InviteCodeResponse(relation.getInviteCode(), relation.getCodeExpiresAt());
    }

    /** 초대코드로 회원이 트레이너와 연결 (REL-04). */
    @Transactional
    public RelationResponse connectTrainer(Long memberId, String code) {
        Relation relation = relationRepository.findByInviteCode(code.trim().toUpperCase())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_CODE_INVALID));

        if (relation.getRelationType() != RelationType.TRAINER_MEMBER
                || relation.getStatus() != RelationStatus.PENDING) {
            throw new BusinessException(ErrorCode.INVITE_CODE_INVALID);
        }
        if (relation.isExpired()) {
            throw new BusinessException(ErrorCode.INVITE_CODE_EXPIRED);
        }
        Long trainerId = relation.getUserAId();
        if (trainerId.equals(memberId)) {
            throw new BusinessException(ErrorCode.INVITE_CODE_INVALID, "본인이 생성한 코드로는 연결할 수 없습니다.");
        }
        if (hasActiveTrainer(memberId)) {
            throw new BusinessException(ErrorCode.ALREADY_CONNECTED, "이미 트레이너와 연결되어 있습니다.");
        }
        // 코드 발급 이후 다른 회원이 먼저 연결됐을 수 있으므로 정원 재확인
        com.fitto.trainer.domain.TrainerProfile profile = trainerProfileRepository.findByUserId(trainerId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVITE_CODE_INVALID));
        if (countActiveMembers(trainerId) >= profile.getMaxMembers()) {
            throw new BusinessException(ErrorCode.TRAINER_MEMBER_LIMIT);
        }

        relation.connect(memberId);
        User trainer = userRepository.findById(trainerId).orElse(null);
        return RelationResponse.of(relation, trainer);
    }

    /** 내 관계 목록 전체 (REL-05). */
    public List<RelationResponse> findMyRelations(Long userId) {
        return relationRepository.findAllByUser(userId).stream()
                .map(r -> toResponse(r, userId))
                .toList();
    }

    public RelationResponse findRelation(Long userId, Long relationId) {
        Relation relation = getOwnedRelation(userId, relationId);
        return toResponse(relation, userId);
    }

    /** 커플 공유 배경 설정. */
    @Transactional
    public RelationResponse setCoupleBackground(Long userId, String url) {
        Relation couple = activeCouple(userId);
        couple.updateBackground(url);
        coupleEventPublisher.publish(couple.getId(), com.fitto.common.event.CoupleEvent.BACKGROUND);
        return toResponse(couple, userId);
    }

    /** 커플 기념일(D-day) 설정. */
    @Transactional
    public RelationResponse setAnniversary(Long userId, java.time.LocalDate date) {
        Relation couple = activeCouple(userId);
        couple.updateAnniversary(date);
        coupleEventPublisher.publish(couple.getId(), com.fitto.common.event.CoupleEvent.ANNIVERSARY);
        return toResponse(couple, userId);
    }

    /** 커플 공동 식단 목표(주간 일수) 설정. */
    @Transactional
    public RelationResponse setDietGoal(Long userId, Integer days) {
        Relation couple = activeCouple(userId);
        couple.updateDietGoal(days);
        coupleEventPublisher.publish(couple.getId(), com.fitto.common.event.CoupleEvent.DIET_GOAL);
        return toResponse(couple, userId);
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
    }

    /** 관계 해제 (REL-06). */
    @Transactional
    public void endRelation(Long userId, Long relationId) {
        Relation relation = getOwnedRelation(userId, relationId);
        relation.end();
    }

    // ---- helpers ----

    private boolean hasActiveCouple(Long userId) {
        return !relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .isEmpty();
    }

    /** 회원(userB) 기준 활성 트레이너 존재 여부 — 회원은 트레이너 1명만 연결 가능 */
    private boolean hasActiveTrainer(Long memberId) {
        return relationRepository
                .findByUserAndTypeAndStatus(memberId, RelationType.TRAINER_MEMBER, RelationStatus.ACTIVE)
                .stream()
                .anyMatch(r -> memberId.equals(r.getUserBId()));
    }

    private long countActiveMembers(Long trainerId) {
        return relationRepository.countByUserAAndTypeAndStatus(
                trainerId, RelationType.TRAINER_MEMBER, RelationStatus.ACTIVE);
    }

    private Relation getOwnedRelation(Long userId, Long relationId) {
        Relation relation = relationRepository.findById(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (!relation.involves(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return relation;
    }

    private RelationResponse toResponse(Relation relation, Long viewerId) {
        Long partnerId = relation.partnerOf(viewerId);
        User partner = partnerId != null ? userRepository.findById(partnerId).orElse(null) : null;
        return RelationResponse.of(relation, partner);
    }

    private String generateUniqueCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(random.nextInt(CODE_ALPHABET.length())));
            }
            String code = sb.toString();
            if (!relationRepository.existsByInviteCode(code)) {
                return code;
            }
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR, "초대코드 생성에 실패했습니다. 다시 시도해주세요.");
    }
}
