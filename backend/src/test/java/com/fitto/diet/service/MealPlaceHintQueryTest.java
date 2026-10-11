package com.fitto.diet.service;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealPlaceHintLoader.PlaceHint;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 장소 힌트 조회 쿼리 — H2 에서 실제로 돌린다. 프롬프트 조립은 {@code FoodAnalysisPhotoPromptTest}
 * 가 저장소를 모킹해 검증하므로, 여기서는 모킹으로는 못 잡는 <b>JPQL 의 의미</b>(방문→항목 조인,
 * 이름 중복 제거, 많이 먹은 순, 10개 제한, 커플 상대의 방문 포함)과 세부 분류가 실리는지만 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealPlaceHintQueryTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired MealService mealService;
    @Autowired MealPlaceHintLoader loader;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    /** 항목만 담은 끼니를 저장하고 그 장소 방문으로 연결한다. */
    private Long eatAt(Long userId, Long placeId, LocalDate day, MealType type, String... foods) {
        List<MealItemRequest> items = java.util.Arrays.stream(foods)
                .map(f -> new MealItemRequest(f, "1인분", 300, 30, 10, 10))
                .toList();
        Long mealId = mealService.save(userId, new SaveMealRequest(day, type, null, null,
                null, null, null, null, null, null, null, items)).id();
        placeService.recordVisit(userId, placeId, new RecordVisitRequest(day, null, null, null, mealId));
        return mealId;
    }

    @Test
    void 방문한_끼니의_메뉴를_중복_없이_많이_먹은_순으로_가져오고_상대의_방문도_포함한다() {
        long[] users = couple("hint1a@fitto.com", "hint1b@fitto.com");
        Long placeId = placeService.save(users[0], new SavePlaceRequest(
                "을지로 김치찌개", null, null, null, "음식점", null, "한식 · 찌개,전골", null)).id();
        LocalDate today = LocalDate.now();
        eatAt(users[0], placeId, today.minusDays(3), MealType.LUNCH, "김치찌개", "공기밥");
        eatAt(users[1], placeId, today.minusDays(1), MealType.DINNER, "계란말이", "김치찌개");

        PlaceHint hint = loader.forPlace(users[0], placeId).orElseThrow();

        assertThat(hint.name()).isEqualTo("을지로 김치찌개");
        assertThat(hint.category()).isEqualTo("음식점");
        assertThat(hint.categoryDetail()).isEqualTo("한식 · 찌개,전골");
        // 장소 상세 "여기서 먹은 것"과 같은 순서 — 많이 먹은 것 먼저(김치찌개 2번), 같으면 최근 것 먼저
        assertThat(hint.menus()).containsExactly("김치찌개", "계란말이", "공기밥");
    }

    @Test
    void 메뉴는_10개까지만_가져온다() {
        long[] users = couple("hint2a@fitto.com", "hint2b@fitto.com");
        Long placeId = placeService.save(users[0],
                new SavePlaceRequest("뷔페", null, null, null, "음식점")).id();
        String[] foods = IntStream.rangeClosed(1, 12).mapToObj(i -> "메뉴" + i).toArray(String[]::new);
        eatAt(users[0], placeId, LocalDate.now(), MealType.LUNCH, foods);

        assertThat(loader.forPlace(users[0], placeId).orElseThrow().menus()).hasSize(MealPlaceHintLoader.MAX_MENUS);
    }

    @Test
    void 남의_장소는_빈_값이고_커플_상대에게는_힌트가_나온다() {
        long[] users = couple("hint3a@fitto.com", "hint3b@fitto.com");
        Long outsider = register("hint3c@fitto.com");
        Long placeId = placeService.save(users[0],
                new SavePlaceRequest("성수 브런치", null, null, null, null)).id();
        eatAt(users[0], placeId, LocalDate.now(), MealType.BREAKFAST, "에그베네딕트");

        assertThat(loader.forPlace(outsider, placeId)).isEmpty();
        assertThat(loader.forPlace(users[1], placeId)).isPresent();
    }
}
