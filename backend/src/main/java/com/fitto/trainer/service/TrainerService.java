package com.fitto.trainer.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.auth.dto.UserResponse;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.trainer.domain.TrainerProfile;
import com.fitto.trainer.domain.TrainerRoutine;
import com.fitto.trainer.dto.AssignRoutineRequest;
import com.fitto.trainer.dto.TrainerDashboardResponse;
import com.fitto.trainer.dto.TrainerDashboardResponse.MemberSummary;
import com.fitto.trainer.dto.TrainerProfileRequest;
import com.fitto.trainer.dto.TrainerProfileResponse;
import com.fitto.trainer.dto.TrainerRoutineResponse;
import com.fitto.trainer.repository.TrainerProfileRepository;
import com.fitto.trainer.repository.TrainerRoutineRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import com.fitto.workout.dto.WorkoutResponse;
import com.fitto.workout.repository.WorkoutRepository;
import com.fitto.workout.service.WorkoutService;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 트레이너 서비스 — 설계서 4.6. 등록(프로필), 대시보드(회원 현황), 회원 기록 조회.
 * 역할 검증은 JWT 클레임 대신 DB(프로필 존재)로 판단한다 — 등록 직후 토큰 재발급 없이도 동작.
 */
@Service
@Transactional(readOnly = true)
public class TrainerService {

    private static final int ROUTINE_PAGE_SIZE = 30;

    private final TrainerProfileRepository trainerProfileRepository;
    private final TrainerRoutineRepository trainerRoutineRepository;
    private final RelationRepository relationRepository;
    private final WorkoutRepository workoutRepository;
    private final UserRepository userRepository;
    private final WorkoutService workoutService;
    private final NotificationService notificationService;

    public TrainerService(TrainerProfileRepository trainerProfileRepository,
                          TrainerRoutineRepository trainerRoutineRepository,
                          RelationRepository relationRepository,
                          WorkoutRepository workoutRepository,
                          UserRepository userRepository,
                          WorkoutService workoutService,
                          NotificationService notificationService) {
        this.trainerProfileRepository = trainerProfileRepository;
        this.trainerRoutineRepository = trainerRoutineRepository;
        this.relationRepository = relationRepository;
        this.workoutRepository = workoutRepository;
        this.userRepository = userRepository;
        this.workoutService = workoutService;
        this.notificationService = notificationService;
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

        LocalDate today = KstClock.today();
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

    // ---- 루틴 (phase 7) ----

    /** 루틴 배정 — 내 회원에게만, 배정 시 회원에게 푸시 (TRAINER-04) */
    @Transactional
    public TrainerRoutineResponse assignRoutine(Long trainerId, AssignRoutineRequest request) {
        getProfile(trainerId);
        Relation relation = activeMemberRelations(trainerId).stream()
                .filter(r -> request.memberId().equals(r.getUserBId()))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.FORBIDDEN, "내 회원에게만 루틴을 배정할 수 있습니다."));

        TrainerRoutine routine = TrainerRoutine.builder()
                .relationId(relation.getId())
                .trainerId(trainerId)
                .memberId(request.memberId())
                .title(request.title().trim())
                .description(request.description())
                .routineDate(request.routineDate())
                .build();
        trainerRoutineRepository.save(routine);

        String trainerName = userName(trainerId);
        notificationService.notify(request.memberId(), "새 운동 루틴이 도착했어요!",
                trainerName + " 트레이너 — " + routine.getTitle(), Map.of("type", "trainerRoutine"));
        return TrainerRoutineResponse.from(routine, trainerName);
    }

    /** 트레이너가 특정 회원에게 배정한 루틴 목록 */
    public List<TrainerRoutineResponse> memberRoutines(Long trainerId, Long memberId) {
        getProfile(trainerId);
        return trainerRoutineRepository
                .findByTrainerIdAndMemberIdOrderByIdDesc(trainerId, memberId, PageRequest.of(0, ROUTINE_PAGE_SIZE))
                .stream()
                .map(r -> TrainerRoutineResponse.from(r, null))
                .toList();
    }

    /** 회원이 받은 루틴 목록 (트레이너 이름 포함) */
    public List<TrainerRoutineResponse> myRoutines(Long memberId) {
        return trainerRoutineRepository
                .findByMemberIdOrderByIdDesc(memberId, PageRequest.of(0, ROUTINE_PAGE_SIZE))
                .stream()
                .map(r -> TrainerRoutineResponse.from(r, userName(r.getTrainerId())))
                .toList();
    }

    /** 회원이 루틴 완료 체크 — 완료 시 트레이너에게 푸시 (TRAINER-05) */
    @Transactional
    public TrainerRoutineResponse completeRoutine(Long memberId, Long routineId) {
        TrainerRoutine routine = trainerRoutineRepository.findById(routineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        if (!memberId.equals(routine.getMemberId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 받은 루틴만 완료할 수 있습니다.");
        }
        boolean firstComplete = !routine.isCompleted();
        routine.complete();
        if (firstComplete) {
            notificationService.notify(routine.getTrainerId(), "회원이 루틴을 완료했어요!",
                    userName(memberId) + " — " + routine.getTitle(),
                    Map.of("type", "trainerMember", "id", String.valueOf(memberId)));
        }
        return TrainerRoutineResponse.from(routine, userName(routine.getTrainerId()));
    }

    /** 루틴 삭제 — 배정한 트레이너만 */
    @Transactional
    public void deleteRoutine(Long trainerId, Long routineId) {
        TrainerRoutine routine = trainerRoutineRepository.findById(routineId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROUTINE_NOT_FOUND));
        if (!trainerId.equals(routine.getTrainerId())) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "내가 배정한 루틴만 삭제할 수 있습니다.");
        }
        trainerRoutineRepository.delete(routine);
    }

    // ---- helpers ----

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getName).orElse("트레이너");
    }

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
