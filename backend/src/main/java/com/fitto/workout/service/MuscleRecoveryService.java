package com.fitto.workout.service;

import com.fitto.workout.dto.MuscleRecoveryResponse;
import com.fitto.workout.dto.MuscleRecoveryResponse.MuscleRecovery;
import com.fitto.workout.repository.WorkoutSetRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 근육 회복 현황 — 부위별 마지막 수행 시각으로부터 경과 시간·추정 회복률을 계산한다.
 *
 * <p>새 테이블 없이 {@code workout_sets.muscle_group} + {@code workouts.created_at} 만
 * 집계해서 매번 계산한다 — 저장되는 데이터가 따로 없어 동기화가 어긋날 일이 없다.
 *
 * <p><b>회복 모델</b>: 정밀한 스포츠과학 모델이 아니라, "큰 근육군은 더 오래 걸린다"는
 * 단순 휴리스틱이다(가슴·등·하체 48시간, 어깨·팔·코어 24시간). 사용자에게는 정확한 예측이
 * 아니라 "오늘 뭘 해야 할지" 감을 잡는 참고용으로 보여준다.
 *
 * <p>경과 시간 계산({@code Duration.between})은 "오늘이 며칠이냐" 판정이 아니라 두 시점
 * 사이의 순수 시간차라서, {@link com.fitto.common.time.KstClock} 이 다루는 종류의
 * UTC/KST 날짜 어긋남 문제와는 무관하다 — {@code lastTrainedAt} 과 {@code now} 가 항상
 * 같은 JVM 타임존 기준으로 찍히므로 그 차이는 타임존에 관계없이 정확하다.
 */
@Service
@Transactional(readOnly = true)
public class MuscleRecoveryService {

    /** 회복에 걸리는 시간(시간 단위). 큰 근육군은 48시간, 작은 근육군은 24시간 — 단순화된 휴리스틱. */
    private static final Map<String, Integer> RECOVERY_WINDOW_HOURS = new LinkedHashMap<>();

    static {
        RECOVERY_WINDOW_HOURS.put("가슴", 48);
        RECOVERY_WINDOW_HOURS.put("등", 48);
        RECOVERY_WINDOW_HOURS.put("하체", 48);
        RECOVERY_WINDOW_HOURS.put("어깨", 24);
        RECOVERY_WINDOW_HOURS.put("팔", 24);
        RECOVERY_WINDOW_HOURS.put("코어", 24);
    }

    private final WorkoutSetRepository workoutSetRepository;

    public MuscleRecoveryService(WorkoutSetRepository workoutSetRepository) {
        this.workoutSetRepository = workoutSetRepository;
    }

    public MuscleRecoveryResponse recovery(Long userId) {
        Map<String, LocalDateTime> lastTrainedByGroup = new LinkedHashMap<>();
        workoutSetRepository.findLastTrainedByMuscleGroup(userId)
                .forEach(row -> lastTrainedByGroup.put(row.getMuscleGroup(), row.getLastTrainedAt()));

        LocalDateTime now = LocalDateTime.now();
        List<MuscleRecovery> muscles = RECOVERY_WINDOW_HOURS.keySet().stream()
                .map(group -> toRecovery(group, lastTrainedByGroup.get(group), now))
                .toList();

        // 가장 최근에 훈련한(=hoursAgo 가 가장 작은) 부위 하나 — 홈 화면 요약 카드용.
        // 한 번도 운동 안 한 유저는 muscles 전부 hoursAgo=null 이라 mostRecent 도 null.
        MuscleRecovery mostRecent = muscles.stream()
                .filter(m -> m.hoursAgo() != null)
                .min(Comparator.comparingLong(MuscleRecovery::hoursAgo))
                .orElse(null);

        return new MuscleRecoveryResponse(muscles, mostRecent);
    }

    private MuscleRecovery toRecovery(String group, LocalDateTime lastTrainedAt, LocalDateTime now) {
        if (lastTrainedAt == null) {
            // 한 번도 안 한 부위 — 회복을 기다릴 이유가 없으니 100%(바로 해도 되는 상태)로 취급.
            return new MuscleRecovery(group, null, null, 100);
        }
        // 이론상 createdAt 은 항상 now 이전이지만, 클럭 오차 등 만일의 경우에도 음수로
        // 보이지 않게 0 아래로는 내려가지 않게 한다.
        long hoursAgo = Math.max(0, Duration.between(lastTrainedAt, now).toHours());
        int windowHours = RECOVERY_WINDOW_HOURS.get(group);
        int percent = (int) Math.max(0, Math.min(100, Math.round(hoursAgo * 100.0 / windowHours)));
        return new MuscleRecovery(group, lastTrainedAt, hoursAgo, percent);
    }
}
