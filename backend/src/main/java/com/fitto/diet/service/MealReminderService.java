package com.fitto.diet.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.domain.MealReminder;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealReminderResponse;
import com.fitto.diet.repository.MealReminderRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;
import java.util.List;
import java.util.Set;

/**
 * 끼니 알림 등록/수정/해제 — 실제 발송은 {@link MealReminderNotifier} 가 담당한다
 * ({@link com.fitto.chat.service.ScheduledChatMessageService} 와 같은 분리 원칙).
 */
@Service
@Transactional(readOnly = true)
public class MealReminderService {

    /** 지원 끼니 — SNACK 은 정해진 시간이 없어 제외({@link MealReminder} 클래스 주석 참고). */
    private static final Set<MealType> SUPPORTED_TYPES =
            Set.of(MealType.BREAKFAST, MealType.LUNCH, MealType.DINNER);

    private final MealReminderRepository reminderRepository;

    public MealReminderService(MealReminderRepository reminderRepository) {
        this.reminderRepository = reminderRepository;
    }

    public List<MealReminderResponse> list(Long userId) {
        return reminderRepository.findByUserId(userId).stream()
                .map(MealReminderResponse::from)
                .toList();
    }

    @Transactional
    public MealReminderResponse set(Long userId, MealType mealType, LocalTime reminderTime) {
        requireSupported(mealType);
        // 스케줄러가 정확히 이 값으로 매칭하므로 분 단위로 고정한다(설정 화면도 분 단위 프리셋만 준다).
        LocalTime truncated = reminderTime.withSecond(0).withNano(0);
        MealReminder reminder = reminderRepository.findByUserIdAndMealType(userId, mealType)
                .orElseGet(() -> MealReminder.builder()
                        .userId(userId).mealType(mealType).reminderTime(truncated).build());
        reminder.updateTime(truncated);
        reminderRepository.save(reminder);
        return MealReminderResponse.from(reminder);
    }

    @Transactional
    public void remove(Long userId, MealType mealType) {
        requireSupported(mealType);
        reminderRepository.deleteByUserIdAndMealType(userId, mealType);
    }

    private void requireSupported(MealType mealType) {
        if (!SUPPORTED_TYPES.contains(mealType)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "이 끼니는 알림을 설정할 수 없어요.");
        }
    }
}
