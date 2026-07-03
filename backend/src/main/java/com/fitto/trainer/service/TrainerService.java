package com.fitto.trainer.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.auth.dto.UserResponse;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trainer.domain.TrainerProfile;
import com.fitto.trainer.dto.TrainerDashboardResponse;
import com.fitto.trainer.dto.TrainerDashboardResponse.MemberSummary;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.dto.TrainerProfileResponse;
import com.fitto.trainer.repository.TrainerProfileRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.dto.WorkoutResponse;
import com.fitto.workout.repository.WorkoutRepository;
import com.fitto.workout.service.WorkoutService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * 트레이너 서비스 — 설계서 4.6. 등록(프로필), 대시보드(회원 현황), 회원 기록 조회.
 * 역할 검증은 JWT 클레임 대신 DB(프로필 존재)로 판단한다 — 등록 직후 토큰 재발급 없이도 동작.
 */
@Service
@Transactional(readOnly = true)
public class TrainerService {

    private final TrainerProfileRepository trainerProfileRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final UserRepository userRepository;
    private final WorkoutService workoutService;

    public TrainerService(TrainerProfileRepository trainerProfileRepository,
                          RelationRepository relationRepository,
                          WorkoutRepository workoutRepository,
                          UserRepository userRepository,
                          WorkoutService workoutService) {
        this.trainerProfileRepository = trainerProfileRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.userRepository = userRepository;
        this.workoutService = workoutService;
    }

    /** 트레이너 등록 — 프로필 생성 + 역할 승격 (TRAINER-01) */
    @Transactional
    public TrainerProfileResponse register(Long userId, TrainerProfileRequest request) {
        if (trainerProfileRepository.existsByUserId(userId)) {
            throw new BusinessException(ErrorCode.ALREADY_TRAINER);
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));

        TrainerProfile profile = TrainerProfile.builder()
                .userId(userId)
                .specialty(request.specialty())
                .introduction(request.introduction())
                .career(request.career())
                .certificate(request.certificate())
                .maxMembers(request.maxMembers())
                .build();
        trainerProfileRepository.save(profile);
        user.promoteToTrainer();
        return TrainerProfileResponse.from(profile);
    }

    public TrainerProfileResponse myProfile(Long userId) {
        return TrainerProfileResponse.from(getProfile(userId));
    }

    @Transactional
    public TrainerProfileResponse updateProfile(Long userId, TrainerProfileRequest request) {
        TrainerProfile profile = getProfile(userId);
        profile.update(request.specialty(), request.introduction(), request.career(),
                request.certificate(), request.maxMembers(), request.isAccepting());
        return TrainerProfileResponse.from(profile);
    }

    /** 대시보드 — 회원 목록 + 오늘 운동 완료 여부 + 마지막 운동일 (TRAINER-02) */
    public TrainerDashboardResponse dashboard(Long trainerId) {
        getProfile(trainerId); // 트레이너 검증

        LocalDate today = LocalDate.now();
        List<MemberSummary> members = new ArrayList<>();
        for (Relation relation : activeMemberRelations(trainerId)) {
            userRepository.findById(relation.getUserBId()).ifPresent(member -> members.add(new MemberSummary(
                    UserResponse.from(member),
                    workoutRepository.existsByUserIdAndWorkoutDate(member.getId(), today),
                    workoutRepository.findLastWorkoutDate(member.getId()))));
        }
        int completedToday = (int) members.stream().filter(MemberSummary::todayCompleted).count();
        return new TrainerDashboardResponse(members.size(), completedToday, members);
    }

    /** 회원 최근 운동 기록 — 내 회원인지 검증 후 조회 (TRAINER-03) */
    public List<WorkoutResponse> memberWorkouts(Long trainerId, Long memberId) {
        getProfile(trainerId);
        boolean isMyMember = activeMemberRelations(trainerId).stream()
                .anyMatch(r -> memberId.equals(r.getUserBId()));
        if (!isMyMember) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내 회원의 기록만 볼 수 있습니다.");
        }
        return workoutService.findHistory(memberId, null);
    }

    // ---- helpers ----

    /** 트레이너(userA) 기준 활성 회원 관계 */
    private List<Relation> activeMemberRelations(Long trainerId) {
        return relationRepository
                .findByUserAndTypeAndStatus(trainerId, RelationType.TRAINER_MEMBER, RelationStatus.ACTIVE)
                .stream()
                .filter(r -> trainerId.equals(r.getUserAId()))
                .toList();
    }

    private TrainerProfile getProfile(Long userId) {
        return trainerProfileRepository.findByUserId(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_A_TRAINER));
    }
}
