package com.fitto.place;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealItemRequest;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.repository.MealRepository;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.service.FeedService;
import com.fitto.place.domain.PlaceRating;
import com.fitto.place.domain.PlaceVisit;
import com.fitto.place.dto.MealVisitResponse;
import com.fitto.place.dto.RatePlaceRequest;
import com.fitto.place.dto.RecordMealVisitRequest;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.repository.PlaceRatingRepository;
import com.fitto.place.repository.PlaceVisitRepository;
import com.fitto.place.service.MealVisitService;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 외식 기록 단일 API(POST /places/meal-visits) — docs/LOVEBODY_LOVELICHELIN_LINK_2026-10-05.md P0.
 * 목 구성은 PlaceRatingNudgeTest·MealNudgeTest 와 같다(알림 목만) — 스프링 컨텍스트를 늘리지 않는다(CLAUDE.md §6).
 */
@SpringBootTest
@ActiveProfiles("test")
class MealVisitTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired MealVisitService mealVisitService;
    @Autowired MealService mealService;
    @Autowired FeedService feedService;
    @Autowired PlaceVisitRepository placeVisitRepository;
    @Autowired PlaceRatingRepository placeRatingRepository;
    @Autowired MealRepository mealRepository;

    @MockitoBean
    NotificationService notificationService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private long[] couple(String tag) {
        Long a = register(tag + "a@fitto.com");
        Long b = register(tag + "b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private Long place(Long userId, String name) {
        return placeService.save(userId, new SavePlaceRequest(name, null, null, null, null)).id();
    }

    private static RecordMealVisitRequest.MealPart lunch(Boolean shared) {
        return new RecordMealVisitRequest.MealPart(MealType.LUNCH, null, null, null, null, null, null, null, null,
                List.of(new MealItemRequest("파스타", "1인분", 600, 70, 20, 25)), shared);
    }

    private static RecordMealVisitRequest req(String key, Long placeId, Integer rating, RecordMealVisitRequest.MealPart meal) {
        // 사진은 요청마다 다르게 — 같은 사진으로 두 끼니를 남기는 건 서버가 막는다(MEAL_PHOTO_ALREADY_RECORDED)
        return new RecordMealVisitRequest(key, placeId, null, null, "https://res.cloudinary.com/x/fitto/" + key + ".jpg",
                "창가 자리", rating, null, meal);
    }

    @Test
    void 한_번에_식단_방문_평점이_생기고_사진은_같은_URL_재방문의사는_null() {
        long[] u = couple("mv1");
        Long placeId = place(u[0], "연남 파스타");

        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, 4, lunch(false)));

        assertThat(res.replayed()).isFalse();
        assertThat(res.meal()).isNotNull();
        PlaceVisit visit = placeVisitRepository.findById(res.visit().id()).orElseThrow();
        assertThat(visit.getMealId()).isEqualTo(res.meal().id());
        assertThat(visit.getImageUrl()).isEqualTo(mealRepository.findById(res.meal().id()).orElseThrow().getPhotoUrl());
        assertThat(visit.getMemo()).isEqualTo("창가 자리");
        // 식단 메모에 장소명을 섞지 않는다(예전 럽슐랭 경로는 "장소명 · 메모")
        assertThat(mealRepository.findById(res.meal().id()).orElseThrow().getMemo()).isNull();
        PlaceRating mine = placeRatingRepository.findByPlaceIdAndUserId(placeId, u[0]).orElseThrow();
        assertThat(mine.getRating()).isEqualTo(4);
        assertThat(mine.getRevisitIntent()).isNull();
        assertThat(res.place().myRating()).isEqualTo(4);
    }

    @Test
    void 같은_키로_다시_보내면_새로_만들지_않고_처음_결과를_돌려준다() {
        long[] u = couple("mv2");
        Long placeId = place(u[0], "광화문 국밥");
        String key = UUID.randomUUID().toString();

        MealVisitResponse first = mealVisitService.record(u[0], req(key, placeId, 5, lunch(false)));
        long visitsBefore = placeVisitRepository.count();
        long mealsBefore = mealRepository.count();
        MealVisitResponse again = mealVisitService.record(u[0], req(key, placeId, 5, lunch(false)));

        assertThat(again.replayed()).isTrue();
        assertThat(again.visit().id()).isEqualTo(first.visit().id());
        assertThat(again.meal().id()).isEqualTo(first.meal().id());
        assertThat(placeVisitRepository.count()).isEqualTo(visitsBefore);
        assertThat(mealRepository.count()).isEqualTo(mealsBefore);
    }

    @Test
    void 대표_평점이_이미_있으면_방문_별점이_덮어쓰지_않는다() {
        long[] u = couple("mv3");
        Long placeId = place(u[0], "성수 카페");
        placeService.rate(u[0], placeId, new RatePlaceRequest(5, null));

        mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, 2, lunch(false)));

        assertThat(placeRatingRepository.findByPlaceIdAndUserId(placeId, u[0]).orElseThrow().getRating()).isEqualTo(5);
        // 방문 별점은 그날의 기록으로 남는다
        assertThat(placeVisitRepository.findByPlaceIdOrderByIdDesc(placeId).get(0).getRating()).isEqualTo(2);
    }

    @Test
    void 같이_먹기는_식단_2행_방문_1행이고_상대_몫에도_장소가_보인다() {
        long[] u = couple("mv4");
        Long placeId = place(u[0], "을지로 노가리");

        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, lunch(true)));

        assertThat(placeVisitRepository.findByPlaceIdOrderByIdDesc(placeId)).hasSize(1);
        List<MealResponse> partnerToday = mealService.findToday(u[1]);
        assertThat(partnerToday).hasSize(1);
        assertThat(partnerToday.get(0).id()).isNotEqualTo(res.meal().id());
        assertThat(partnerToday.get(0).placeId()).isEqualTo(placeId);
        assertThat(partnerToday.get(0).placeName()).isEqualTo("을지로 노가리");
    }

    @Test
    void 식단이_있으면_상대에게_식단_푸시_한_번만_장소_이름을_싣는다() {
        long[] u = couple("mv5");
        Long placeId = place(u[0], "망원 칼국수");
        clearInvocations(notificationService);

        mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, 4, lunch(false)));

        verify(notificationService, times(1)).notify(eq(u[1]), eq(NotificationCategory.PARTNER), anyString(),
                contains("망원 칼국수"), anyString());
        verify(notificationService, never()).notify(eq(u[1]), any(), contains("새 맛집 방문"), anyString(), anyString());
        verify(notificationService, never()).notify(eq(u[1]), any(), contains("평가를 기다려요"), anyString(), anyString());
    }

    @Test
    void 방문만_기록하면_식단_없이_방문_푸시가_간다() {
        long[] u = couple("mv6");
        Long placeId = place(u[0], "서촌 전시");
        clearInvocations(notificationService);

        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, null));

        assertThat(res.meal()).isNull();
        assertThat(placeVisitRepository.findById(res.visit().id()).orElseThrow().getMealId()).isNull();
        verify(notificationService).notify(eq(u[1]), any(), contains("새 맛집 방문"), anyString(), anyString());
    }

    @Test
    void 검색_결과로_보내면_장소를_만들고_같은_카카오_장소면_기존_장소에_붙인다() {
        long[] u = couple("mv7");
        SavePlaceRequest kakao = new SavePlaceRequest("삼청동 수제비", "서울 종로구", new BigDecimal("37.5843"),
                new BigDecimal("126.9820"), "음식점", "kakao-777");

        MealVisitResponse first = mealVisitService.record(u[0], new RecordMealVisitRequest(UUID.randomUUID().toString(),
                null, kakao, null, null, null, null, null, lunch(false)));
        MealVisitResponse second = mealVisitService.record(u[1], new RecordMealVisitRequest(UUID.randomUUID().toString(),
                null, kakao, null, null, null, null, null, null));

        assertThat(first.place().created()).isTrue();
        assertThat(second.place().id()).isEqualTo(first.place().id());
        assertThat(placeVisitRepository.findByPlaceIdOrderByIdDesc(first.place().id())).hasSize(2);
    }

    @Test
    void 장소를_안_고르거나_둘_다_보내거나_미래_날짜면_거절한다() {
        long[] u = couple("mv8");
        Long placeId = place(u[0], "아무 곳");
        SavePlaceRequest kakao = new SavePlaceRequest("다른 곳", null, null, null, null);

        assertThatThrownBy(() -> mealVisitService.record(u[0], new RecordMealVisitRequest(UUID.randomUUID().toString(),
                null, null, null, null, null, null, null, null))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> mealVisitService.record(u[0], new RecordMealVisitRequest(UUID.randomUUID().toString(),
                placeId, kakao, null, null, null, null, null, null))).isInstanceOf(BusinessException.class);
        LocalDate tomorrow = KstClock.today().plusDays(1);
        assertThatThrownBy(() -> mealVisitService.record(u[0], new RecordMealVisitRequest(UUID.randomUUID().toString(),
                placeId, null, tomorrow, null, null, null, null, lunch(false)))).isInstanceOf(BusinessException.class);
        // 옛 방문 API 도 미래 날짜는 막는다(식단과 같은 기준)
        assertThatThrownBy(() -> placeService.recordVisit(u[0], placeId,
                new RecordVisitRequest(tomorrow, null, null, null, null))).isInstanceOf(BusinessException.class);
    }

    @Test
    void 식단_삭제는_기본으로_방문을_남기고_withVisit_이면_내_방문도_지운다() {
        long[] u = couple("mv9");
        Long placeId = place(u[0], "홍대 라멘");
        MealVisitResponse keep = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, lunch(false)));
        MealVisitResponse drop = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null,
                new RecordMealVisitRequest.MealPart(MealType.DINNER, "회식", 500, null, null, null, null, null, null, null, false)));

        mealService.delete(u[0], keep.meal().id());
        mealService.delete(u[0], drop.meal().id(), true);

        assertThat(placeVisitRepository.findById(keep.visit().id())).get()
                .extracting(PlaceVisit::getMealId).isNull();
        assertThat(placeVisitRepository.findById(drop.visit().id())).isEmpty();
    }

    @Test
    void 타임라인에서_외식은_식사_카드_한_장이고_별점을_싣는다() {
        long[] u = couple("mv10");
        Long placeId = place(u[0], "한남 베이커리");
        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, 4, lunch(false)));

        List<FeedItemResponse> items = feedService.timeline(u[1], null, 20).items();

        assertThat(items).noneMatch(i -> i.type() == FeedItemType.PLACE_VISIT && i.refId().equals(res.visit().id()));
        FeedItemResponse mealCard = items.stream()
                .filter(i -> i.type() == FeedItemType.MEAL && i.refId().equals(res.meal().id()))
                .findFirst().orElseThrow();
        assertThat(mealCard.content()).contains("📍한남 베이커리 ★4");
    }

    @Test
    void 여기서_먹은_것은_음식_이름별_횟수이고_두_번_이상이면_대표_메뉴로_제안한다() {
        long[] u = couple("mv12");
        Long placeId = place(u[0], "연남 파스타");
        RecordMealVisitRequest.MealPart carbonara = new RecordMealVisitRequest.MealPart(MealType.LUNCH, null, null, null,
                null, null, null, null, null, List.of(new MealItemRequest("까르보나라", null, 700, null, null, null),
                new MealItemRequest("샐러드", null, 200, null, null, null)), false);
        RecordMealVisitRequest.MealPart again = new RecordMealVisitRequest.MealPart(MealType.DINNER, null, null, null,
                null, null, null, null, null, List.of(new MealItemRequest("까르보나라", null, 700, null, null, null)), true);
        mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, carbonara));
        // 같이 먹기 — 식단은 두 행이지만 방문은 내 몫에만 붙어 한 번만 센다
        mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, again));

        var menu = placeService.menu(u[1], placeId);

        assertThat(menu.items()).extracting(i -> i.name() + ":" + i.times())
                .containsExactly("까르보나라:2", "샐러드:1");
        assertThat(menu.signature()).containsExactly("까르보나라");
    }

    @Test
    void 타임라인_식사_카드는_장소_id_를_싣는다() {
        long[] u = couple("mv13");
        Long placeId = place(u[0], "북촌 칼국수");
        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, lunch(false)));

        FeedItemResponse mealCard = feedService.timeline(u[1], null, 20).items().stream()
                .filter(i -> i.type() == FeedItemType.MEAL && i.refId().equals(res.meal().id()))
                .findFirst().orElseThrow();

        assertThat(mealCard.placeId()).isEqualTo(placeId);
    }

    @Test
    void 이미_장소가_연결된_식단에_방문을_또_붙이면_거절한다() {
        long[] u = couple("mv11");
        Long placeId = place(u[0], "잠실 롯데");
        MealVisitResponse res = mealVisitService.record(u[0], req(UUID.randomUUID().toString(), placeId, null, lunch(false)));

        assertThatThrownBy(() -> placeService.recordVisit(u[0], placeId,
                new RecordVisitRequest(null, null, null, null, res.meal().id()))).isInstanceOf(BusinessException.class);
    }
}
