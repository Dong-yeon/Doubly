package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.notification.NotificationService;
import com.fitto.place.dto.PlaceMenuResponse;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.dto.SaveMenuBoardRequest;
import com.fitto.place.repository.PlaceMenuItemRepository;
import com.fitto.place.repository.PlaceMenuPhotoRepository;
import com.fitto.place.service.MenuBoardService;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.service.RelationRecordPurger;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 우리가 쌓는 메뉴(V131) — 저장(통째로 바꾸기)·메뉴판 사진·권한·관계 단위 삭제.
 * 목 구성은 MealVisitTest 와 같다(알림 목만) — 스프링 컨텍스트를 늘리지 않는다(CLAUDE.md §6).
 */
@SpringBootTest
@ActiveProfiles("test")
class MenuBoardTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired MenuBoardService menuBoardService;
    @Autowired PlaceMenuItemRepository itemRepository;
    @Autowired PlaceMenuPhotoRepository photoRepository;
    @Autowired RelationRecordPurger relationRecordPurger;

    @MockitoBean
    NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String tag) {
        Long a = register("mb-" + tag + "a@fitto.com");
        Long b = register("mb-" + tag + "b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        return new long[]{a, b};
    }

    private Long place(Long userId, String name) {
        return placeService.save(userId, new SavePlaceRequest(name, null, null, null, null)).id();
    }

    private static SaveMenuBoardRequest.Item item(String name, Integer price) {
        return new SaveMenuBoardRequest.Item(name, price);
    }

    private static String photo(String key) {
        return "https://res.cloudinary.com/x/fitto/menu-" + key + ".jpg";
    }

    @Test
    void 저장하면_순서대로_남고_상대도_같은_메뉴를_본다() {
        long[] u = couple("1");
        Long placeId = place(u[0], "을밀대");

        PlaceMenuResponse res = menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(
                List.of(item("물냉면", 13000), item(" 비빔냉면 ", 13000), item("물냉면", 14000), item("녹두전", null)),
                photo("1")));

        assertThat(res.board()).extracting(PlaceMenuResponse.BoardItem::name).containsExactly("물냉면", "비빔냉면", "녹두전");
        assertThat(res.board().get(0).price()).isEqualTo(13000);
        assertThat(res.board().get(2).price()).isNull();
        assertThat(res.boardPhotos()).hasSize(1);
        assertThat(res.boardPhotos().get(0).uploadedBy()).isEqualTo(u[0]);

        PlaceMenuResponse partner = menuBoardService.menu(u[1], placeId);
        assertThat(partner.board()).extracting(PlaceMenuResponse.BoardItem::name).containsExactly("물냉면", "비빔냉면", "녹두전");
        // "여기서 먹은 것"은 식단이 없으니 비어 있다 — 두 갈래가 섞이지 않는다
        assertThat(partner.items()).isEmpty();
    }

    @Test
    void 다시_저장하면_통째로_바뀌고_같은_사진은_두_번_붙지_않는다() {
        long[] u = couple("2");
        Long placeId = place(u[0], "진진");
        menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(item("멘보샤", 20000)), photo("2")));

        // 응답을 못 받고 다시 누른 것 — 같은 요청이 메뉴·사진을 두 벌로 만들지 않는다
        menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(item("멘보샤", 20000)), photo("2")));
        assertThat(itemRepository.findByPlaceIdOrderBySortOrderAscIdAsc(placeId)).hasSize(1);
        assertThat(photoRepository.countByPlaceId(placeId)).isEqualTo(1);

        // 상대가 고친다 — 사진 없이 목록만
        PlaceMenuResponse res = menuBoardService.save(u[1], placeId,
                new SaveMenuBoardRequest(List.of(item("멘보샤", 22000), item("가지튀김", 18000)), null));
        assertThat(res.board()).extracting(PlaceMenuResponse.BoardItem::price).containsExactly(22000, 18000);
        assertThat(res.boardPhotos()).hasSize(1);

        // 빈 목록이면 메뉴를 비운다
        assertThat(menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(), null)).board()).isEmpty();
    }

    @Test
    void 메뉴판_사진은_10장까지() {
        long[] u = couple("3");
        Long placeId = place(u[0], "메뉴 많은 집");
        for (int i = 0; i < 10; i++) {
            menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(), photo("3-" + i)));
        }
        assertThatThrownBy(() -> menuBoardService.save(u[0], placeId,
                new SaveMenuBoardRequest(List.of(), photo("3-new"))))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("10장");
        // 이미 붙은 사진을 다시 보내는 건 막지 않는다(재전송)
        menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(item("국수", 8000)), photo("3-0")));
    }

    @Test
    void 사진은_둘_중_누구나_지울_수_있고_다른_장소의_사진_id_로는_못_지운다() {
        long[] u = couple("4");
        Long placeId = place(u[0], "광화문 국밥");
        Long otherPlaceId = place(u[0], "다른 집");
        Long photoId = menuBoardService.save(u[0], placeId,
                new SaveMenuBoardRequest(List.of(), photo("4"))).boardPhotos().get(0).id();

        assertThatThrownBy(() -> menuBoardService.deletePhoto(u[1], otherPlaceId, photoId))
                .isInstanceOf(BusinessException.class);

        assertThat(menuBoardService.deletePhoto(u[1], placeId, photoId).boardPhotos()).isEmpty();
    }

    @Test
    void 남의_장소_메뉴는_보지도_고치지도_못한다() {
        long[] mine = couple("5");
        long[] others = couple("6");
        Long placeId = place(mine[0], "우리 집");

        assertThatThrownBy(() -> menuBoardService.menu(others[0], placeId)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> menuBoardService.save(others[0], placeId,
                new SaveMenuBoardRequest(List.of(item("가짜", 1)), null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> menuBoardService.requireAccess(others[0], placeId)).isInstanceOf(BusinessException.class);
    }

    @Test
    void 관계를_지우면_메뉴와_메뉴판_사진도_함께_지워지고_사진_URL_을_돌려준다() {
        long[] u = couple("7");
        Long placeId = place(u[0], "헤어질 집");
        menuBoardService.save(u[0], placeId, new SaveMenuBoardRequest(List.of(item("짜장면", 7000)), photo("7")));
        Long relationId = relationService.findMyRelations(u[0]).get(0).id();

        relationService.endRelation(u[1], relationId);
        List<String> urls = relationRecordPurger.purge(relationId);

        assertThat(itemRepository.findByPlaceIdOrderBySortOrderAscIdAsc(placeId)).isEmpty();
        assertThat(photoRepository.countByPlaceId(placeId)).isZero();
        assertThat(urls).contains(photo("7"));
    }
}
