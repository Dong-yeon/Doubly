package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.diet.dto.FavoriteFoodItemRequest;
import com.fitto.diet.dto.FavoriteFoodResponse;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.service.FavoriteFoodService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 즐겨찾기 세트(여러 음식 조합) 저장/조회/삭제 — H2 기반. */
@SpringBootTest
@ActiveProfiles("test")
class FavoriteFoodFlowTest {

    @Autowired
    AuthService authService;
    @Autowired
    FavoriteFoodService favoriteFoodService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    @Test
    void 여러_음식을_세트로_저장하면_이름이_없으면_항목명을_이어붙여_자동_생성한다() {
        Long user = register("ff1@fitto.com");

        FavoriteFoodResponse saved = favoriteFoodService.save(user, new SaveFavoriteFoodRequest(null, List.of(
                new FavoriteFoodItemRequest("닭가슴살", 165, 0, 31, 4),
                new FavoriteFoodItemRequest("고구마", 130, 30, 2, 0),
                new FavoriteFoodItemRequest("아몬드", 80, 3, 3, 7))));

        assertThat(saved.name()).isEqualTo("닭가슴살, 고구마, 아몬드");
        assertThat(saved.items()).hasSize(3);
        assertThat(saved.totalCalories()).isEqualTo(165 + 130 + 80);
        assertThat(saved.totalProtein()).isEqualTo(31 + 2 + 3);
    }

    @Test
    void 세트_이름을_직접_지정하면_그대로_쓴다() {
        Long user = register("ff2@fitto.com");

        FavoriteFoodResponse saved = favoriteFoodService.save(user, new SaveFavoriteFoodRequest("아침 세트", List.of(
                new FavoriteFoodItemRequest("계란", 70, null, null, null))));

        assertThat(saved.name()).isEqualTo("아침 세트");
        assertThat(saved.items()).hasSize(1);
    }

    @Test
    void 같은_이름의_세트는_중복_저장할_수_없다() {
        Long user = register("ff3@fitto.com");
        favoriteFoodService.save(user, new SaveFavoriteFoodRequest("아침 세트", List.of(
                new FavoriteFoodItemRequest("계란", 70, null, null, null))));

        assertThatThrownBy(() -> favoriteFoodService.save(user, new SaveFavoriteFoodRequest("아침 세트", List.of(
                new FavoriteFoodItemRequest("토스트", 200, null, null, null)))))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void 목록_조회와_삭제가_정상_동작한다() {
        Long user = register("ff4@fitto.com");
        FavoriteFoodResponse saved = favoriteFoodService.save(user, new SaveFavoriteFoodRequest(null, List.of(
                new FavoriteFoodItemRequest("샐러드", 120, null, null, null))));

        assertThat(favoriteFoodService.list(user)).hasSize(1);

        favoriteFoodService.delete(user, saved.id());
        assertThat(favoriteFoodService.list(user)).isEmpty();
    }
}
