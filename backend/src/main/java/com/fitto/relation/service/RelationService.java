package com.fitto.relation.service;

import com.fitto.common.analytics.AnalyticsEvent;
import com.fitto.common.analytics.EventLogService;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.relation.domain.MemberRole;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationMember;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.dto.RestoreRecordsResponse;
import com.fitto.relation.repository.RelationMemberRepository;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(RelationService.class);

    private final SecureRandom random = new SecureRandom();
    private final RelationRepository relationRepository;
    private final RelationMemberRepository relationMemberRepository;
    private final UserRepository userRepository;
    private final com.fitto.trainer.repository.TrainerProfileRepository trainerProfileRepository;
    private final com.fitto.common.event.CoupleEventPublisher coupleEventPublisher;
    private final RelationRecordPurger relationRecordPurger;
    private final RelationRecordRestorer relationRecordRestorer;
    private final CloudinaryImageDeleter imageDeleter;
    private final PlanGuard planGuard;
    private final EventLogService eventLogService;

    public RelationService(RelationRepository relationRepository,
                           RelationMemberRepository relationMemberRepository,
                           UserRepository userRepository,
                           com.fitto.trainer.repository.TrainerProfileRepository trainerProfileRepository,
                           com.fitto.common.event.CoupleEventPublisher coupleEventPublisher,
                           RelationRecordPurger relationRecordPurger,
                           RelationRecordRestorer relationRecordRestorer,
                           CloudinaryImageDeleter imageDeleter,
                           PlanGuard planGuard,
                           EventLogService eventLogService) {
        this.relationRepository = relationRepository;
        this.relationMemberRepository = relationMemberRepository;
        this.userRepository = userRepository;
        this.trainerProfileRepository = trainerProfileRepository;
        this.coupleEventPublisher = coupleEventPublisher;
        this.relationRecordPurger = relationRecordPurger;
        this.relationRecordRestorer = relationRecordRestorer;
        this.imageDeleter = imageDeleter;
        this.planGuard = planGuard;
        this.eventLogService = eventLogService;
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
        addMember(relation.getId(), userId, MemberRole.PARTNER);
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
        addMember(relation.getId(), userId, MemberRole.PARTNER);
        User partner = userRepository.findById(relation.getUserAId()).orElse(null);
        eventLogService.log(userId, relation.getId(), AnalyticsEvent.COUPLE_CONNECTED, null);
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
        addMember(relation.getId(), trainerId, MemberRole.TRAINER);
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
        addMember(relation.getId(), memberId, MemberRole.MEMBER);
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
        planGuard.require(userId, Feature.CUSTOM_BACKGROUND);
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

    /**
     * 지난 기록 불러오기 요청 (REL-07).
     *
     * <p>재회하면 새 관계가 만들어지고 옛 기록은 보이지 않는 상태로 남는다.
     * 이 API 로 <b>양쪽이 모두</b> 요청하면 그때 복원된다 — 공유 기록이라
     * 한쪽이 단독으로 되살리면 상대가 원치 않는 과거를 다시 마주하게 된다.
     *
     * <p>첫 호출은 요청만 접수하고(WAITING_PARTNER), 상대가 호출하면 실행된다(RESTORED).
     * 같은 사람이 두 번 눌러도 실행되지 않는다.
     */
    @Transactional
    public RestoreRecordsResponse requestRestore(Long userId) {
        Relation current = activeCouple(userId);
        Long partnerId = current.partnerOf(userId);
        if (partnerId == null) {
            throw new BusinessException(ErrorCode.RELATION_NOT_FOUND);
        }

        Long previousId = relationRepository.findEndedCoupleBetween(userId, partnerId)
                .stream().findFirst()
                .map(Relation::getId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NO_RECORDS_TO_RESTORE));

        // 빈 슬롯이면 원자적으로 선점 — 동시 요청도 DB 가 행 단위로 직렬화한다
        if (relationRepository.claimRestoreRequest(previousId, userId) == 1) {
            log.info("지난 기록 불러오기 요청 접수: oldRelationId={}, 요청자={}", previousId, userId);
            return RestoreRecordsResponse.waiting();
        }

        /*
         * 슬롯이 이미 차 있다 — 내가 이전에 요청해둔 것(중복 탭)인지 상대의 요청인지 확인.
         * 행 잠금으로 재조회해 (1) 복원 실행을 직렬화하고(같은 합의로 두 번 복원 방지),
         * (2) 잠금 대기 중 완전삭제로 행이 사라진 경우를 empty 로 감지한다.
         * claimRestoreRequest 의 clearAutomatically 덕에 이 조회는 1차 캐시가 아닌
         * DB 의 최신 값을 읽는다.
         */
        Relation previous = relationRepository.findByIdForUpdate(previousId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NO_RECORDS_TO_RESTORE));
        if (!previous.isRestoreAgreedBy(userId)) {
            // 요청자가 나 자신 — 이미 접수된 상태 그대로
            return RestoreRecordsResponse.waiting();
        }

        int moved = relationRecordRestorer.restore(previous.getId(), current.getId());
        coupleEventPublisher.publish(current.getId(), com.fitto.common.event.CoupleEvent.BACKGROUND);
        log.info("지난 기록 복원 완료: {} → {}, {}건", previous.getId(), current.getId(), moved);
        return RestoreRecordsResponse.restored(moved);
    }

    /** 복원 가능한 지난 기록이 있는지 — 안내 배너 노출 여부 판단용. */
    public boolean hasRestorableRecords(Long userId) {
        return relationRepository.findByUserAndTypeAndStatus(
                        userId, RelationType.COUPLE, RelationStatus.ACTIVE).stream()
                .findFirst()
                .map(current -> current.partnerOf(userId))
                .filter(java.util.Objects::nonNull)
                .map(partnerId -> !relationRepository.findEndedCoupleBetween(userId, partnerId).isEmpty())
                .orElse(false);
    }

    /**
     * 지난 기록 완전 삭제 (AUTH-10) — 되돌릴 수 없다.
     *
     * <p>연결을 끊으면 기록은 남아있되 보이지 않는 상태가 된다(나중에 불러오기 위함).
     * 이 API 는 그 기록을 업로드된 이미지까지 영구히 지운다.
     *
     * <p><b>활성 관계에는 쓸 수 없다.</b> 연결된 상태에서 실수로 호출하면 사용 중인 기록이
     * 통째로 사라지므로, 먼저 연결을 끊도록 강제한다.
     *
     * <p><b>한쪽이 지우면 양쪽 모두에서 사라진다.</b> 커플 콘텐츠는 관계에 매여 있어
     * 한 사람의 몫만 남길 수 없다. 개인정보 삭제 요구를 상대 동의에 묶어둘 수도 없으므로
     * 단독 삭제를 허용하되, 클라이언트가 되돌릴 수 없음을 분명히 알려야 한다.
     */
    @Transactional
    public void purgeRecords(Long userId, Long relationId) {
        Relation relation = getOwnedRelation(userId, relationId);
        if (relation.isActive()) {
            throw new BusinessException(ErrorCode.RELATION_STILL_ACTIVE);
        }
        // 행 잠금 — 불러오기(restore)와 동시에 돌면 이동과 삭제가 뒤섞여 기록이 유실될 수 있다.
        // 잠금 대기 중 복원으로 행이 사라졌으면 지울 기록도 없는 것이다.
        relationRepository.findByIdForUpdate(relationId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        List<String> imageUrls = relationRecordPurger.purge(relationId);
        // 이미지는 커밋 이후에 — 롤백돼도 파일은 되돌릴 수 없다
        imageDeleter.deleteAllAfterCommit(imageUrls);
        log.info("지난 기록 완전 삭제: relationId={}, 요청자={}, 이미지={}건",
                relationId, userId, imageUrls.size());
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
        // FAMILY 는 3번째 이후 멤버가 A/B 슬롯에 없으므로 멤버십도 함께 본다
        if (!relation.involves(userId)
                && !relationMemberRepository.existsByRelationIdAndUserId(relationId, userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        return relation;
    }

    /** 멤버 행 이중 기록 — backfill 된 기존 관계와 겹칠 수 있어 멱등하게 넣는다. */
    private void addMember(Long relationId, Long userId, MemberRole role) {
        if (relationMemberRepository.existsByRelationIdAndUserId(relationId, userId)) {
            return;
        }
        relationMemberRepository.save(RelationMember.builder()
                .relationId(relationId)
                .userId(userId)
                .memberRole(role)
                .build());
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
