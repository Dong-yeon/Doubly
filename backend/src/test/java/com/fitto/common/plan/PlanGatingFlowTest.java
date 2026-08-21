package com.fitto.common.plan;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.calendar.dto.CreateEventRequest;
import com.fitto.calendar.service.CalendarService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.diet.dto.FavoriteFoodItemRequest;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.service.FavoriteFoodService;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.service.MemoriesService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.summary.dto.WeeklyRecapResponse;
import com.fitto.summary.service.SummaryService;
import com.fitto.trip.dto.SaveTripExpenseRequest;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripExpenseService;
import com.fitto.trip.service.TripService;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.service.WorkoutRoutineService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 기능별 게이팅 — 무료 플랜에서 각 한도가 실제로 걸리는지.
 *
 * <p>핵심은 <b>무엇을 던지고 무엇을 던지지 않는가</b>다. 사용자가 직접 누른 동작은 402 로
 * 막아 업그레이드를 안내하고, 화면이 자동으로 부르는 조회(홈의 추억, MY 탭의 주간 결산)는
 * 잠김 표시로 내린다 — 그러지 않으면 앱을 열 때마다 업그레이드 시트가 뜬다.
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
class PlanGatingFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired TripService tripService;
    @Autowired TripExpenseService tripExpenseService;
    @Autowired PlaceService placeService;
    @Autowired WorkoutRoutineService routineService;
    @Autowired FavoriteFoodService favoriteFoodService;
    @Autowired CalendarService calendarService;
    @Autowired MemoriesService memoriesService;
    @Autowired SummaryService summaryService;
    @Autowired ChatService chatService;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    /** 커플 연결 — 커플 기능 대부분이 활성 관계를 전제한다. */
    private Long couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return a;
    }

    private ErrorCode errorCodeOf(Throwable e) {
        return ((BusinessException) e).getErrorCode();
    }

    /* ── 개수형 한도 ──────────────────────────────────────────────────────── */

    @Test
    void 무료는_진행_중인_여행을_하나만_만들_수_있다() {
        Long user = couple("gate-trip-a@fitto.com", "gate-trip-b@fitto.com");
        LocalDate today = LocalDate.now();

        tripService.save(user, new SaveTripRequest("첫 여행", today, today.plusDays(2), null, null));

        assertThatThrownBy(() -> tripService.save(user,
                new SaveTripRequest("둘째 여행", today.plusDays(10), today.plusDays(12), null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    @Test
    void 이미_끝난_여행은_한도에_세지_않는다() {
        // 지난 여행까지 세면 무료 사용자가 추억을 지워야 새 여행을 만들 수 있게 된다.
        Long user = couple("gate-trip-past-a@fitto.com", "gate-trip-past-b@fitto.com");
        LocalDate today = LocalDate.now();

        tripService.save(user, new SaveTripRequest("작년 여행",
                today.minusDays(30), today.minusDays(27), null, null));

        assertThatCode(() -> tripService.save(user,
                new SaveTripRequest("다음 여행", today.plusDays(3), today.plusDays(5), null, null)))
                .doesNotThrowAnyException();
    }

    @Test
    void 무료_맛집핀_한도를_넘기면_막힌다() {
        Long user = couple("gate-place-a@fitto.com", "gate-place-b@fitto.com");
        int limit = Feature.PLACE_PIN.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            placeService.save(user, new SavePlaceRequest("맛집" + i, null, null, null, null, null, null));
        }

        assertThatThrownBy(() -> placeService.save(user,
                new SavePlaceRequest("한도초과", null, null, null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    @Test
    void 무료_루틴_한도를_넘기면_막힌다() {
        Long user = register("gate-routine@fitto.com");
        int limit = Feature.WORKOUT_ROUTINE.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            routineService.save(user, routineRequest("루틴" + i));
        }

        assertThatThrownBy(() -> routineService.save(user, routineRequest("한도초과")))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    private SaveRoutineRequest routineRequest(String title) {
        return new SaveRoutineRequest(title, List.of(
                new SaveRoutineRequest.Exercise("스쿼트", "근력", 3, 10, new BigDecimal("60"), null, null, null)));
    }

    @Test
    void 무료_즐겨찾기_한도를_넘기면_막힌다() {
        Long user = register("gate-fav@fitto.com");
        int limit = Feature.FAVORITE_FOOD.quotaFor(Plan.FREE).limit();

        for (int i = 0; i < limit; i++) {
            favoriteFoodService.save(user, new SaveFavoriteFoodRequest("세트" + i,
                    List.of(new FavoriteFoodItemRequest("닭가슴살", 200, 0, 40, 3))));
        }

        assertThatThrownBy(() -> favoriteFoodService.save(user, new SaveFavoriteFoodRequest("한도초과",
                List.of(new FavoriteFoodItemRequest("계란", 80, 1, 7, 5)))))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    @Test
    void 무료_캘린더_월_한도를_넘기면_막힌다() {
        Long user = couple("gate-cal-a@fitto.com", "gate-cal-b@fitto.com");
        int limit = Feature.CALENDAR_EVENT.quotaFor(Plan.FREE).limit();
        LocalDate today = LocalDate.now();

        for (int i = 0; i < limit; i++) {
            calendarService.create(user, new CreateEventRequest("일정" + i, today, null, false, null));
        }

        assertThatThrownBy(() -> calendarService.create(user,
                new CreateEventRequest("한도초과", today, null, false, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);
    }

    /* ── 차단형 (무료에서 아예 막힌 기능) ────────────────────────────────── */

    @Test
    void 무료는_여행_경비_정산을_쓸_수_없다() {
        Long user = couple("gate-exp-a@fitto.com", "gate-exp-b@fitto.com");
        LocalDate today = LocalDate.now();
        Long tripId = tripService.save(user,
                new SaveTripRequest("경비 여행", today, today.plusDays(2), null, null)).id();

        assertThatThrownBy(() -> tripExpenseService.add(user, tripId,
                new SaveTripExpenseRequest(new BigDecimal("100000"), null, "KRW", "숙박", null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    @Test
    void 무료는_커플_배경을_바꿀_수_없다() {
        Long user = couple("gate-bg-a@fitto.com", "gate-bg-b@fitto.com");

        assertThatThrownBy(() ->
                relationService.setCoupleBackground(user, "https://example.com/bg.jpg"))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    @Test
    void 무료도_커플_배경을_해제할_수_있다() {
        // 꾸미기는 PRO 기능이지만 되돌리기까지 막으면 PRO 가 끝난 사람은 배경을 영영 못 치운다
        Long user = couple("gate-bgclear-a@fitto.com", "gate-bgclear-b@fitto.com");

        assertThatCode(() -> relationService.setCoupleBackground(user, null))
                .doesNotThrowAnyException();
        assertThat(relationService.setCoupleBackground(user, null).backgroundImageUrl()).isNull();
    }

    @Test
    void 무료는_프리미엄_터치_제스처를_보낼_수_없다() {
        // 기본 3종(손잡기·토닥임·콕찌르기)은 무료에도 전부 열려 있다 — 프리미엄(포옹·뽀뽀)만 막힌다
        Long user = register("gate-touch-a@fitto.com");
        Long partner = register("gate-touch-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(user);
        Long relationId = relationService.connectCouple(partner, invite.code()).id();

        assertThatCode(() -> chatService.send(user, relationId,
                new SendMessageRequest(MessageType.TOUCH, "PAT", null, null, null, null)))
                .doesNotThrowAnyException();

        assertThatThrownBy(() -> chatService.send(user, relationId,
                new SendMessageRequest(MessageType.TOUCH, "HUG", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(this::errorCodeOf)
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    /* ── 자동 조회는 던지지 않는다 (이 절이 이 테스트의 핵심) ─────────────── */

    @Test
    void 추억은_잠겨도_에러가_아니라_잠김표시로_내려온다() {
        // 홈이 실행할 때마다 부르는 조회다. 402 를 던지면 앱을 열 때마다 시트가 뜬다.
        Long user = couple("gate-mem-a@fitto.com", "gate-mem-b@fitto.com");

        MemoriesResponse response = memoriesService.memories(user, null);

        assertThat(response.locked()).isTrue();
        assertThat(response.groups()).isEmpty();
        assertThat(response.totalCount()).isZero();
    }

    @Test
    void 주간_결산도_잠김표시로_내려온다() {
        Long user = register("gate-recap@fitto.com");

        WeeklyRecapResponse response = summaryService.weeklyRecap(user);

        assertThat(response.locked()).isTrue();
        assertThat(response.weekStart()).isNotNull();   // 기간은 여전히 채워 보낸다
    }
}
