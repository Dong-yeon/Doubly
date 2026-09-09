package com.fitto.workout.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.plan.Feature;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.workout.dto.WorkoutPhotoAnalysisResponse;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 운동 인증샷 AI 분석 — 다른 앱의 완료 화면을 읽어 기록을 채운다.
 *
 * <p><b>왜 만들었나</b>: 운동을 남기려면 종목·세트·횟수를 입력해야 했는데, 사람들이 운동 후
 * 실제로 하는 행동은 <b>스트라바·삼성헬스·애플워치 요약이나 트레드밀 화면을 찍는 것</b>이다.
 * 그 사진을 그대로 받으면 없던 습관을 요구하지 않고 이미 있는 습관에 얹을 수 있다.
 *
 * <p>구조는 {@link com.fitto.diet.service.FoodAnalysisService} 와 같다(Cloudinary 이미지 →
 * Gemini 구조화 출력 → 프리필). 그쪽이 이미 영양성분표의 <b>인쇄된 숫자를 읽어오는</b> 경로를
 * 갖고 있어, 트레드밀 LCD·앱 스크린샷의 숫자를 읽는 것도 같은 난이도로 다룰 수 있다.
 */
@Service
public class WorkoutPhotoAnalysisService {

    private static final String PROMPT = """
            사진은 운동 기록입니다. 다음 중 하나입니다 — 읽어서 값을 채워주세요.
            - 운동 앱(스트라바·나이키런·삼성 헬스·애플 피트니스 등)의 운동 완료 요약 화면 캡처
            - 트레드밀·사이클 등 운동기구 계기판을 찍은 사진
            - 스마트워치의 운동 요약 화면

            읽는 규칙:
            - 화면에 <b>적혀 있는 숫자를 그대로 옮깁니다</b>. 추정하지 않습니다.
            - durationMin 은 운동 시간을 분으로 환산한 값입니다. (예: "32:10" → 32, "1:05:00" → 65)
            - distanceKm 은 거리(km)입니다. 마일(mi)로 적혀 있으면 km 로 환산합니다(1mi = 1.609km).
              거리가 화면에 없으면(근력 운동, 실내 사이클 등) 생략합니다.
            - calories 는 소모 칼로리(kcal)로 적혀 있을 때만 채웁니다.
            - exerciseName 은 한국어 종목명입니다. (예: "러닝", "트레드밀", "사이클", "걷기", "등산")
              무슨 운동인지 화면에 없으면 사진에서 판단되는 가장 가까운 이름을 씁니다.
            - category 는 반드시 근력 / 유산소 / 유연성 중 하나입니다. 달리기·걷기·자전거·수영·
              등산처럼 심폐 위주면 유산소입니다.
            - sourceApp 에는 어떤 화면을 읽었는지 짧게 적습니다. (예: "스트라바", "삼성 헬스",
              "애플 워치", "트레드밀 계기판")
            - 페이스는 채우지 않습니다. 시간과 거리로 앱이 직접 계산합니다.
            - comment 에는 짧고 다정한 한국어 한 줄을 적습니다.

            운동 기록으로 읽을 만한 화면이 아니면(음식 사진, 셀카, 풍경 등) isWorkout 을 false 로
            하고 나머지는 모두 생략합니다. 억지로 값을 지어내지 않습니다.
            """;

    /**
     * Gemini 구조화 출력 스키마.
     *
     * <p>{@code isWorkout} 만 required 다. 나머지를 필수로 걸면 화면에 없는 값(거리 없는 실내
     * 사이클, 칼로리를 안 보여주는 계기판)까지 모델이 <b>지어내게</b> 된다 — 여기서 지어낸 숫자는
     * 그대로 사용자의 기록이 되므로, 비어 오는 편이 낫다.
     */
    static final Map<String, Object> RESPONSE_SCHEMA = Map.of(
            "type", "OBJECT",
            "properties", Map.of(
                    "isWorkout", Map.of("type", "BOOLEAN"),
                    "exerciseName", Map.of("type", "STRING"),
                    "category", Map.of("type", "STRING", "enum", List.of("근력", "유산소", "유연성")),
                    "durationMin", Map.of("type", "INTEGER"),
                    "distanceKm", Map.of("type", "NUMBER"),
                    "calories", Map.of("type", "INTEGER"),
                    "sourceApp", Map.of("type", "STRING"),
                    "comment", Map.of("type", "STRING")),
            "required", List.of("isWorkout"));

    private static final Set<String> VALID_CATEGORIES = Set.of("근력", "유산소", "유연성");

    private final GeminiClient geminiClient;
    /** 설정 의존이 없어 직접 만든다 — 음식 사진 분석과 같은 방식. */
    private final CloudinaryImageFetcher imageFetcher = new CloudinaryImageFetcher();

    public WorkoutPhotoAnalysisService(GeminiClient geminiClient) {
        this.geminiClient = geminiClient;
    }

    public WorkoutPhotoAnalysisResponse analyze(Long userId, String photoUrl) {
        geminiClient.requireConfiguredAndCountUsage(userId, Feature.AI_WORKOUT_PHOTO);

        CloudinaryImageFetcher.Image image = imageFetcher.fetch(photoUrl);
        JsonNode result = geminiClient.generateJsonInBackground(userId, Feature.AI_WORKOUT_PHOTO,
                List.of(GeminiClient.imagePart(image.mimeType(), image.bytes()), GeminiClient.textPart(PROMPT)),
                RESPONSE_SCHEMA);
        return toResponse(result);
    }

    /** 매핑 — 테스트가 Gemini 없이 직접 검증할 수 있게 package-private 로 둔다. */
    WorkoutPhotoAnalysisResponse toResponse(JsonNode result) {
        if (result == null || !result.path("isWorkout").asBoolean(false)) {
            return WorkoutPhotoAnalysisResponse.notWorkout();
        }
        return new WorkoutPhotoAnalysisResponse(
                true,
                text(result, "exerciseName"),
                category(text(result, "category")),
                positiveInt(result, "durationMin"),
                positiveDecimal(result, "distanceKm"),
                positiveInt(result, "calories"),
                text(result, "sourceApp"),
                text(result, "comment"));
    }

    private static String text(JsonNode node, String field) {
        String value = node.path(field).asText(null);
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * 카테고리는 앱의 칩(근력/유산소/유연성)과 정확히 같아야 한다 — 다른 값이 들어오면
     * 화면이 어느 칩도 선택하지 못하고, 유산소 판정(시간·거리 입력)도 깨진다.
     * 스키마의 enum 으로 대부분 걸러지지만 모델이 벗어나는 경우가 있어 여기서 한 번 더 막는다.
     */
    private static String category(String raw) {
        return raw != null && VALID_CATEGORIES.contains(raw) ? raw : null;
    }

    /** 0 이나 음수는 "못 읽었다"와 같다 — 0분·0km 짜리 기록을 만들지 않는다. */
    private static Integer positiveInt(JsonNode node, String field) {
        JsonNode value = node.path(field);
        return value.isNumber() && value.asInt() > 0 ? value.asInt() : null;
    }

    private static BigDecimal positiveDecimal(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (!value.isNumber() || value.asDouble() <= 0) {
            return null;
        }
        return BigDecimal.valueOf(value.asDouble()).setScale(2, java.math.RoundingMode.HALF_UP);
    }
}
