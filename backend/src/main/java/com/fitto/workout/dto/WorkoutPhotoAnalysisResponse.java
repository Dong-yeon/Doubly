package com.fitto.workout.dto;

import java.math.BigDecimal;

/**
 * 운동 인증샷 분석 결과 — <b>추정치</b>다. 저장은 사용자가 기록 화면에서 확인한 뒤 한다.
 *
 * <p>자동 저장하지 않는 이유: 숫자를 잘못 읽은 채 조용히 저장되면 기록 추이가 오염되고,
 * 나중에는 무엇이 진짜였는지 알 방법이 없다. 음식 사진 분석({@code MealAnalysisResponse})이
 * 같은 원칙을 쓴다 — AI 는 칸을 채워줄 뿐 확정은 사람이 한다.
 *
 * @param isWorkout   운동 기록으로 볼 만한 사진인가. false 면 나머지는 전부 비어 있다
 * @param exerciseName 종목명(한국어) — "러닝", "트레드밀", "사이클" 등
 * @param category    근력 / 유산소 / 유연성 — 앱의 카테고리 칩과 같은 값
 * @param durationMin 운동 시간(분)
 * @param distanceKm  이동 거리(km) — 근력이거나 화면에 없으면 null
 * @param calories    소모 칼로리(kcal) — <b>참고용</b>. 앱마다 추정 공식이 달라 기록에 저장하지 않는다
 * @param sourceApp   사진의 출처("스트라바", "삼성 헬스", "트레드밀" 등) — 사용자에게 무엇을 읽었는지 알린다
 * @param comment     짧은 한 줄 코멘트(한국어)
 */
public record WorkoutPhotoAnalysisResponse(
        boolean isWorkout,
        String exerciseName,
        String category,
        Integer durationMin,
        BigDecimal distanceKm,
        Integer calories,
        String sourceApp,
        String comment
) {
    /** 운동 사진이 아니었을 때 — 화면은 "읽지 못했어요"로 안내하고 사진만 붙인 기록을 권한다. */
    public static WorkoutPhotoAnalysisResponse notWorkout() {
        return new WorkoutPhotoAnalysisResponse(false, null, null, null, null, null, null, null);
    }
}
