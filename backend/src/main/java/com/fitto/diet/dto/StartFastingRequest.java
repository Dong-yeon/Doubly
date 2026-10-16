package com.fitto.diet.dto;

import com.fitto.diet.domain.FastingPlan;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * 간헐적 단식 시작 요청. targetHours 는 CUSTOM 일 때 필수이고, 이름 있는 프리셋은 비우면
 * {@link FastingPlan#defaultHours()} 를 쓴다(직접 시간을 조정하고 싶으면 프리셋이어도 채워도 된다).
 *
 * <p>minutesAgo — "다 먹은 지 30분 됐어요"처럼 시작 시각을 앞당긴다(비우면 0 = 지금). 끼니 기록에 먹은
 * 시각이 없어 저장 순간을 먹은 순간으로 보는데, 다 먹고 한참 뒤 기록하는 사람이 많다. 최대 6시간 —
 * 그보다 먼 과거는 "단식을 시작한다"가 아니라 기록을 고쳐 쓰는 일이다. 직전 단식이 끝난 시각보다
 * 앞으로는 당기지 않는다(서버가 잘라낸다).
 */
public record StartFastingRequest(
        @NotNull(message = "단식 방식을 선택해주세요.") FastingPlan planType,
        @Min(value = 1, message = "1시간 이상으로 설정해주세요.")
        @Max(value = 48, message = "48시간 이하로 설정해주세요.")
        Integer targetHours,
        @Min(value = 0, message = "시작 시각이 올바르지 않아요.")
        @Max(value = 360, message = "시작 시각은 6시간 전까지만 고를 수 있어요.")
        Integer minutesAgo
) {
    public int minutesAgoOrZero() {
        return minutesAgo == null ? 0 : minutesAgo;
    }
}
