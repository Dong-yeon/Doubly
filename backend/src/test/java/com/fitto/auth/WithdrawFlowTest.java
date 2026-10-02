package com.fitto.auth;

import com.fitto.auth.dto.LoginRequest;
import com.fitto.auth.dto.TokenResponse;
import com.fitto.auth.dto.UserResponse;
import com.fitto.auth.service.AccountWithdrawalService;
import com.fitto.auth.service.AccountWithdrawalSweeper;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.user.domain.User;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.LocalDateTime;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.plan.SubscriptionRepository;
import com.fitto.common.plan.TestPro;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.challenge.domain.ChallengeType;
import com.fitto.challenge.dto.CreateChallengeRequest;
import com.fitto.challenge.service.CoupleChallengeService;
import com.fitto.diet.dto.FavoriteFoodItemRequest;
import com.fitto.diet.dto.SaveFavoriteFoodRequest;
import com.fitto.diet.service.FavoriteFoodGiftService;
import com.fitto.diet.service.FavoriteFoodService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.RecordVisitRequest;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.service.DailyQuestionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripService;
import com.fitto.chat.domain.StickerPacks;
import com.fitto.sticker.domain.UserStickerPurchase;
import com.fitto.sticker.repository.UserStickerPurchaseRepository;
import com.fitto.user.repository.UserRepository;
import com.fitto.voice.domain.VoicePhrase;
import com.fitto.voice.dto.SaveVoiceClipRequest;
import com.fitto.voice.dto.SendBoosterRequest;
import com.fitto.voice.service.VoiceClipService;
import com.fitto.voice.service.WorkoutBoosterService;
import com.fitto.workout.dto.SaveProgramRequest;
import com.fitto.workout.dto.SaveWorkoutRequest;
import com.fitto.workout.dto.WorkoutSetRequest;
import com.fitto.workout.dto.SaveRoutineRequest;
import com.fitto.workout.dto.SaveRoutineRequest.Exercise;
import com.fitto.workout.service.RoutineGiftService;
import com.fitto.workout.service.WorkoutRoutineService;
import com.fitto.workout.service.WorkoutService;
import com.fitto.journal.domain.JournalSource;
import com.fitto.journal.dto.SaveJournalRequest;
import com.fitto.journal.repository.JournalEntryRepository;
import com.fitto.journal.service.JournalService;
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;

/**
 * 회원 탈퇴 — AUTH-06.
 *
 * <p>탈퇴는 users / relations 를 참조하는 모든 테이블을 먼저 정리해야 한다.
 * 하나라도 빠지면 외래키 위반으로 탈퇴 자체가 실패한다.
 * 이 테스트는 실제 마이그레이션 스키마(외래키 포함)에서 돌아야 의미가 있다
 * — application-test.yml 에서 Flyway 를 켜둔 이유다.
 *
 * <p>2026-09-30 부터 탈퇴는 유예기간을 둔다 — 요청({@code request})은 예정일만 남기고,
 * 실제 삭제({@code purgeNow} / 스위퍼의 {@code purgeIfDue})는 기간이 지난 뒤다.
 * FK 정리 순서 검증은 삭제 본체인 purgeNow 로 한다.
 */
@SpringBootTest
@ActiveProfiles("test")
class WithdrawFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired AccountWithdrawalService withdrawalService;
    @Autowired AccountWithdrawalSweeper withdrawalSweeper;
    /** 탈퇴 요청·취소 때 상대에게 가는 푸시를 확인한다 */
    @MockitoBean NotificationService notificationService;
    @Autowired RelationService relationService;
    @Autowired SubscriptionRepository subscriptionRepository;
    @Autowired PlaceService placeService;
    @Autowired FeedService feedService;
    @Autowired TripService tripService;
    @Autowired CoupleChallengeService challengeService;
    @Autowired DailyQuestionService dailyQuestionService;
    @Autowired BodyMetricService bodyMetricService;
    @Autowired UserRepository userRepository;
    @Autowired UserStickerPurchaseRepository stickerPurchaseRepository;
    @Autowired VoiceClipService voiceClipService;
    @Autowired WorkoutBoosterService boosterService;
    @Autowired WorkoutRoutineService workoutRoutineService;
    @Autowired RoutineGiftService routineGiftService;
    @Autowired FavoriteFoodService favoriteFoodService;
    @Autowired FavoriteFoodGiftService favoriteFoodGiftService;
    @Autowired WorkoutService workoutService;
    @Autowired MealService mealService;
    @Autowired JournalService journalService;
    @Autowired JournalEntryRepository journalEntryRepository;
    /** 스파이 — 테스트 프로필은 Cloudinary 미설정이라 실제 삭제는 no-op, 어떤 URL 을 넘기는지만 본다 */
    @MockitoSpyBean CloudinaryImageDeleter imageDeleter;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    /**
     * 앱을 실제로 쓴 계정(커플 연결 + 각 기능에 기록 생성)이 탈퇴할 수 있어야 한다.
     *
     * <p>이전에는 places / feed_posts / trips / couple_challenges / daily_answers 를
     * 정리하지 않은 채 relations 를 삭제해 FK 위반으로 실패했다.
     */
    @Test
    void 커플_기록이_있는_계정도_탈퇴할_수_있다() {
        Long me = register("withdraw-full-a@fitto.com");
        Long partner = register("withdraw-full-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());

        // relations 를 참조하는 커플 콘텐츠
        placeService.save(me, new SavePlaceRequest(
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null));
        feedService.createPost(me, new CreatePostRequest("오늘의 기록", null));
        tripService.save(me, new SaveTripRequest(
                "여행", LocalDate.now(), LocalDate.now().plusDays(2), null, null));
        challengeService.create(me, new CreateChallengeRequest(
                ChallengeType.WORKOUT, "챌린지", LocalDate.now(), LocalDate.now().plusDays(7), null));
        dailyQuestionService.answer(me, new AnswerRequest("오늘의 답변", null));

        // users 를 참조하는 개인 데이터
        bodyMetricService.save(me, new SaveBodyMetricRequest(
                LocalDate.now(), new BigDecimal("70.0"), null, null, null, null));

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();
        assertThat(userRepository.findById(me)).isEmpty();
    }

    /**
     * 탈퇴하면 운동 인증샷 파일까지 지운다 — DB 행만 지우면 이미지는 URL 로 영구히 남는다.
     *
     * <p>운동 인증샷은 러닝 앱 화면 캡처가 대부분이라 <b>달린 경로 지도</b>가 함께 찍혀 있다.
     * 탈퇴한 사람의 집 근처 동선이 Cloudinary 에 그대로 남아 있으면 "완전 삭제"라고 부를 수 없다.
     * (체중 사진·음식 사진과 같은 처방 — UserDataPurger 의 개인 데이터 이미지 수집 참고)
     */
    @Test
    void 탈퇴하면_운동_인증샷도_함께_지운다() {
        Long me = register("withdraw-photo@fitto.com");
        String screenshot = "https://res.cloudinary.com/demo/image/upload/v1/fitto/strava-map.jpg";
        workoutService.save(me, new SaveWorkoutRequest(
                LocalDate.now(), null, 30, null, null, screenshot, List.of()));

        withdrawalService.purgeNow(me);

        // 커밋 이후 삭제라 목록에 담겨 넘어갔는지로 확인한다(테스트 프로필은 실제 호출 no-op)
        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(imageDeleter, atLeastOnce()).deleteAllAfterCommit(captor.capture());
        assertThat(captor.getAllValues().stream().flatMap(Collection::stream)).contains(screenshot);
    }

    /**
     * 목소리 녹음(음성 응원·운동 부스터)과 프로필 사진도 탈퇴와 함께 지운다 — 예전에는 삭제 목록에
     * 빠져 있어 DB 행만 사라지고 파일은 Cloudinary 에 남았다. 소셜 가입이 들고 온 카카오·구글
     * 주소는 우리가 지울 수 있는 파일이 아니므로 목록에 넣지 않는다.
     */
    @Test
    void 탈퇴하면_음성_녹음과_프로필_사진도_함께_지운다() {
        Long me = register("withdraw-audio-a@fitto.com");
        Long partner = register("withdraw-audio-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());
        TestPro.grant(subscriptionRepository, me, partner);

        String clip = "https://res.cloudinary.com/demo/video/upload/v1/fitto/voice/rest.m4a";
        String sentBoost = "https://res.cloudinary.com/demo/video/upload/v1/fitto/voice/boost-me.m4a";
        String receivedBoost = "https://res.cloudinary.com/demo/video/upload/v1/fitto/voice/boost-partner.m4a";
        String profile = "https://res.cloudinary.com/demo/image/upload/v1/fitto/profile.jpg";
        voiceClipService.save(me, new SaveVoiceClipRequest(VoicePhrase.REST_END, clip));
        boosterService.send(me, new SendBoosterRequest(sentBoost, "화이팅"));
        boosterService.send(partner, new SendBoosterRequest(receivedBoost, null));
        User user = userRepository.findById(me).orElseThrow();
        user.updateProfile(user.getName(), profile);
        userRepository.save(user);

        withdrawalService.purgeNow(me);

        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(imageDeleter, atLeastOnce()).deleteAllAfterCommit(captor.capture());
        assertThat(captor.getAllValues().stream().flatMap(Collection::stream))
                .contains(clip, sentBoost, receivedBoost, profile);
    }

    @Test
    void 소셜_프로필_주소는_삭제_목록에_넣지_않는다() {
        Long me = register("withdraw-social-profile@fitto.com");
        String kakao = "http://k.kakaocdn.net/dn/abc/img_640x640.jpg";
        User user = userRepository.findById(me).orElseThrow();
        user.updateProfile(user.getName(), kakao);
        userRepository.save(user);

        withdrawalService.purgeNow(me);

        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(imageDeleter, atLeastOnce()).deleteAllAfterCommit(captor.capture());
        assertThat(captor.getAllValues().stream().flatMap(Collection::stream)).doesNotContain(kakao);
    }

    /**
     * 상대가 탈퇴해도 남은 쪽 계정은 살아있어야 하고,
     * 이후 그 사람도 정상적으로 탈퇴할 수 있어야 한다(잔여 데이터가 발목을 잡지 않는지).
     */
    @Test
    void 상대가_탈퇴한_뒤에도_남은_쪽이_탈퇴할_수_있다() {
        Long me = register("withdraw-left-a@fitto.com");
        Long partner = register("withdraw-left-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());

        placeService.save(me, new SavePlaceRequest(
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null));
        feedService.createPost(partner, new CreatePostRequest("상대의 기록", null));

        withdrawalService.purgeNow(me);
        assertThat(userRepository.findById(partner)).isPresent();

        assertThatCode(() -> withdrawalService.purgeNow(partner)).doesNotThrowAnyException();
        assertThat(userRepository.findById(partner)).isEmpty();
    }

    /**
     * V43 이후 신설된 테이블(voice_clips, routine_gifts, favorite_food_gifts,
     * workout_programs)이 purger 삭제 순서에서 빠져 있으면 이 테스트가 외래키 위반으로
     * 실패한다 — 실제로 겪은 사고(진단 리포트 확정 버그 #1). couple_characters(V45)는
     * 게임화 보류 결정에 따라 V56에서 테이블·코드를 함께 정리해 이 목록에서 빠졌다.
     */
    @Test
    void 음성응원_선물_프로그램을_쓴_계정도_탈퇴할_수_있다() {
        Long me = register("withdraw-new-tables-a@fitto.com");
        Long partner = register("withdraw-new-tables-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());
        // 운동 부스터는 PRO 전용이다 — 여기서 보는 건 탈퇴 시 FK 정리지 게이팅이 아니다
        TestPro.grant(subscriptionRepository, me, partner);

        // voice_clips — users FK
        voiceClipService.save(me, new SaveVoiceClipRequest(VoicePhrase.REST_END, "https://res.cloudinary.com/x/rest.m4a"));

        // workout_boosters(V61) — relations + users(sender/receiver) FK 3개를 동시에 문다
        boosterService.send(me, new SendBoosterRequest("https://res.cloudinary.com/x/boost.m4a", "화이팅"));
        boosterService.send(partner, new SendBoosterRequest("https://res.cloudinary.com/x/boost2.m4a", null));

        // routine_gifts — relations/users/workout_routines FK
        Long routineId = workoutRoutineService.save(me, new SaveRoutineRequest(
                "가슴 운동", List.of(new Exercise(
                        "벤치프레스", "가슴", 3, 10, new BigDecimal("60"), null, "가슴", "바벨")),
                java.util.Set.of(DayOfWeek.MONDAY))).id();
        routineGiftService.send(me, routineId, "이 루틴 해봐");

        // favorite_food_gifts — relations/users FK
        Long favoriteFoodId = favoriteFoodService.save(me, new SaveFavoriteFoodRequest(
                "아침 세트", List.of(new FavoriteFoodItemRequest("계란", 80, 1, 6, 5)))).id();
        favoriteFoodGiftService.send(me, favoriteFoodId, "이거 먹어봐");

        // workout_programs — users FK, workout_routines.program_id 가 이 테이블을 참조
        workoutRoutineService.saveProgram(me, new SaveProgramRequest(
                "4주 프로그램", 4, List.of(new SaveProgramRequest.ProgramDay(
                        DayOfWeek.MONDAY, List.of(new Exercise(
                                "스쿼트", "하체", 3, 10, new BigDecimal("50"), null, "하체", "바벨"))))));

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();
        assertThat(userRepository.findById(me)).isEmpty();
    }

    /**
     * 피드 반응은 V60 에서 대상이 4종(포스트·운동·식단·방문)으로 넓어지면서 FK CASCADE 를
     * 잃었다 — 이제 반응 삭제는 코드(두 purger)의 책임이다. {@code feed_reactions.user_id}
     * 의 users FK 는 일부러 남겨 뒀으므로, 어느 한 타입이라도 정리에서 빠지면 여기서
     * 외래키 위반으로 즉시 드러난다.
     */
    @Test
    void 운동_식단_맛집_카드에_반응을_남긴_계정도_탈퇴할_수_있다() {
        Long me = register("withdraw-react-a@fitto.com");
        Long partner = register("withdraw-react-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());

        Long postId = feedService.createPost(me, new CreatePostRequest("오늘의 기록", null)).refId();
        Long workoutId = workoutService.save(me, new SaveWorkoutRequest(
                LocalDate.now(), null, 40, null, null,
                List.of(new WorkoutSetRequest("벤치프레스", "가슴", 3, 10, new BigDecimal("60"), 1)))).id();
        Long mealId = mealService.save(me, new SaveMealRequest(
                LocalDate.now(), MealType.LUNCH, "점심", null, 600, null, null, null,
                null, null, null, null)).id();
        Long placeId = placeService.save(me, new SavePlaceRequest(
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null)).id();
        Long visitId = placeService.recordVisit(me, placeId, new RecordVisitRequest(
                LocalDate.now(), 5, "좋았다", null, null)).id();

        // 양쪽이 서로의 카드에 반응 — 지우는 쪽(관계 단위·개인 단위)이 모두 걸리도록
        feedService.toggleReaction(partner, FeedItemType.POST, postId, "❤️");
        feedService.toggleReaction(partner, FeedItemType.WORKOUT, workoutId, "💪");
        feedService.toggleReaction(partner, FeedItemType.MEAL, mealId, "😋");
        feedService.toggleReaction(partner, FeedItemType.PLACE_VISIT, visitId, "👍");
        feedService.toggleReaction(me, FeedItemType.WORKOUT, workoutId, "🔥");

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();
        assertThat(userRepository.findById(me)).isEmpty();
        assertThatCode(() -> withdrawalService.purgeNow(partner)).doesNotThrowAnyException();
    }

    /**
     * 스티커 팩 낱개 구매(V96) — {@code user_id} 에 FK 가 없어서 탈퇴를 막지는 <b>않지만</b>,
     * 그래서 오히려 빠뜨리면 조용히 남는다. 탈퇴한 사람의 구매 이력을 들고 있을 이유가 없다
     * (환불·정산 근거는 스토어 콘솔에 남는다 — subscriptions·ai_usage_logs 와 같은 판단).
     *
     * <p>FK 가 없으니 "탈퇴가 성공했다"만으로는 아무것도 증명되지 않는다 — 행이 실제로
     * 사라졌는지를 본다.
     */
    @Test
    void 스티커_팩을_산_계정은_구매_이력까지_지워진다() {
        Long me = register("withdraw-sticker@fitto.com");
        stickerPurchaseRepository.save(UserStickerPurchase.builder()
                .userId(me)
                .stickerPackId(StickerPacks.MOOD_PREMIUM)
                .transactionId("txn-withdraw")
                .build());

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();
        assertThat(stickerPurchaseRepository.findByUserIdAndStickerPackId(me, StickerPacks.MOOD_PREMIUM))
                .as("탈퇴했는데 스티커 팩 구매 이력이 남아 있다")
                .isEmpty();
    }

    /**
     * 산 팩은 <b>헤어져도 남는다</b> — 일회성 상품이라 산 사람에게 영구 귀속되고,
     * 관계가 끝났다고 회수하면 환불 없는 몰수가 된다. RelationRecordPurger 가
     * user_sticker_purchases 를 일부러 건드리지 않는 것이 여기서 확인된다.
     */
    @Test
    void 상대가_탈퇴해도_내가_산_팩은_남는다() {
        Long me = register("withdraw-keep-a@fitto.com");
        Long partner = register("withdraw-keep-b@fitto.com");
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());

        stickerPurchaseRepository.save(UserStickerPurchase.builder()
                .userId(me)
                .stickerPackId(StickerPacks.TOUCH_PREMIUM)
                .transactionId("txn-keep")
                .build());

        withdrawalService.purgeNow(partner);

        assertThat(stickerPurchaseRepository.findByUserIdAndStickerPackId(me, StickerPacks.TOUCH_PREMIUM))
                .as("상대가 탈퇴했다고 내가 산 팩이 사라졌다")
                .isPresent();
    }

    @Test
    void 커플_연결이_없는_계정도_탈퇴할_수_있다() {
        Long solo = register("withdraw-solo@fitto.com");
        bodyMetricService.save(solo, new SaveBodyMetricRequest(
                LocalDate.now(), new BigDecimal("65.0"), null, null, null, null));

        assertThatCode(() -> withdrawalService.purgeNow(solo)).doesNotThrowAnyException();
        assertThat(userRepository.findById(solo)).isEmpty();
    }

    /* ── 같이 먹은 식단 (lovebody-current-state §4-1) ─────────────────────────── */

    private SaveMealRequest dateMeal() {
        return new SaveMealRequest(KstClock.today(), MealType.DINNER, "파스타", null, 900,
                null, null, null, null, null, null, null, true);
    }

    /**
     * 데이트 식단은 상대 명의 복제본을 만들고 그 행의 {@code created_by} 에 등록자를 적는다(V50, users FK).
     * 탈퇴 정리가 {@code user_id} 로만 지우면 상대 행이 탈퇴자를 계속 가리켜 users 삭제가 FK 위반으로 실패했다.
     * 상대 몫은 상대의 기록이다 — 지우지 않고 혼자 먹은 기록으로 남긴다.
     */
    @Test
    void 같이_먹은_식단을_등록한_계정도_탈퇴할_수_있고_상대_몫은_혼자_기록으로_남는다() {
        Long me = register("withdraw-datemeal-a@fitto.com");
        Long partner = register("withdraw-datemeal-b@fitto.com");
        connectCouple(me, partner);
        mealService.save(me, dateMeal());

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();
        assertThat(userRepository.findById(me)).isEmpty();

        List<MealResponse> left = mealService.findToday(partner);
        assertThat(left).hasSize(1);
        assertThat(left.get(0).calories()).isEqualTo(450);
        assertThat(left.get(0).sharedWithPartner()).isFalse();
        // 남은 쪽도 그 기록을 지우고 탈퇴할 수 있다
        assertThatCode(() -> mealService.delete(partner, left.get(0).id())).doesNotThrowAnyException();
        assertThatCode(() -> withdrawalService.purgeNow(partner)).doesNotThrowAnyException();
    }

    /** 반대 방향 — 상대가 등록한 데이트 식단의 내 몫을 갖고 탈퇴해도, 상대 원본이 사라진 짝을 가리키지 않는다. */
    @Test
    void 상대가_등록한_데이트_식단의_몫을_가진_채_탈퇴하면_상대_원본은_혼자_기록이_된다() {
        Long me = register("withdraw-datemeal-c@fitto.com");
        Long partner = register("withdraw-datemeal-d@fitto.com");
        connectCouple(me, partner);
        mealService.save(partner, dateMeal());

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();

        List<MealResponse> left = mealService.findToday(partner);
        assertThat(left).hasSize(1);
        assertThat(left.get(0).sharedWithPartner()).isFalse();
        assertThatCode(() -> withdrawalService.purgeNow(partner)).doesNotThrowAnyException();
    }

    /* ── 탈퇴 유예기간 (2026-09-30) ─────────────────────────────────────────── */

    private Long connectCouple(Long me, Long partner) {
        InviteCodeResponse invite = relationService.createCoupleInvite(me);
        relationService.connectCouple(partner, invite.code());
        return me;
    }

    /**
     * 한 명의 탈퇴가 상대의 추억을 예고 없이 지우던 것을 막는다 — 요청 시점에는 아무것도
     * 지우지 않고, 상대에게 삭제 예정일을 알린다.
     */
    @Test
    void 탈퇴_요청은_기록을_지우지_않고_상대에게_알린다() {
        Long me = register("grace-request-a@fitto.com");
        Long partner = register("grace-request-b@fitto.com");
        connectCouple(me, partner);
        feedService.createPost(me, new CreatePostRequest("함께한 기록", null));

        LocalDate scheduled = withdrawalService.request(me);

        assertThat(scheduled).isEqualTo(KstClock.today().plusDays(14));
        User user = userRepository.findById(me).orElseThrow();
        assertThat(user.isWithdrawalPending()).isTrue();
        assertThat(UserResponse.from(user).withdrawalScheduledDate()).isEqualTo(scheduled);
        verify(imageDeleter, never()).deleteAllAfterCommit(any());
        verify(notificationService).notify(eq(partner), eq(NotificationCategory.PARTNER),
                contains("탈퇴를 요청"), anyString(), anyString());
    }

    @Test
    void 유예기간_중_로그인하면_탈퇴가_취소된다() {
        Long me = register("grace-cancel-a@fitto.com");
        Long partner = register("grace-cancel-b@fitto.com");
        connectCouple(me, partner);
        withdrawalService.request(me);

        TokenResponse tokens = authService.login(new LoginRequest("grace-cancel-a@fitto.com", "password123"), IP);

        assertThat(tokens.withdrawalCanceled()).isTrue();
        assertThat(tokens.user().withdrawalScheduledDate()).isNull();
        assertThat(userRepository.findById(me).orElseThrow().isWithdrawalPending()).isFalse();
        verify(notificationService).notify(eq(partner), eq(NotificationCategory.PARTNER),
                contains("탈퇴를 취소"), anyString(), anyString());

        // 취소된 계정은 예정 시각이 지나도 지워지지 않는다
        assertThat(withdrawalService.purgeIfDue(me, LocalDateTime.now().plusDays(30))).isFalse();
        assertThat(userRepository.findById(me)).isPresent();
    }

    @Test
    void 평소_로그인은_탈퇴_취소로_보이지_않는다() {
        register("grace-normal@fitto.com");
        TokenResponse tokens = authService.login(new LoginRequest("grace-normal@fitto.com", "password123"), IP);
        assertThat(tokens.withdrawalCanceled()).isFalse();
    }

    @Test
    void 유예기간이_지나야_계정과_기록이_삭제된다() {
        Long me = register("grace-due-a@fitto.com");
        Long partner = register("grace-due-b@fitto.com");
        connectCouple(me, partner);
        feedService.createPost(me, new CreatePostRequest("함께한 기록", null));
        withdrawalService.request(me);

        // 지금 돌아가는 스위퍼는 아직 기간이 남은 계정을 건드리지 않는다
        withdrawalSweeper.sweep();
        assertThat(userRepository.findById(me)).isPresent();
        assertThat(withdrawalService.purgeIfDue(me, LocalDateTime.now().plusDays(13))).isFalse();

        assertThat(withdrawalService.purgeIfDue(me, LocalDateTime.now().plusDays(15))).isTrue();
        assertThat(userRepository.findById(me)).isEmpty();
        assertThat(userRepository.findById(partner)).isPresent();
    }

    @Test
    void 탈퇴를_두_번_요청해도_예정일이_밀리지_않고_알림도_한_번이다() {
        Long me = register("grace-twice-a@fitto.com");
        Long partner = register("grace-twice-b@fitto.com");
        connectCouple(me, partner);

        LocalDate first = withdrawalService.request(me);
        LocalDate second = withdrawalService.request(me);

        assertThat(second).isEqualTo(first);
        verify(notificationService, times(1)).notify(eq(partner), eq(NotificationCategory.PARTNER),
                contains("탈퇴를 요청"), anyString(), anyString());
    }

    /**
     * 나만의 하루 기록(V116) — 관계가 아니라 사람 소유라 관계 단위 삭제가 건드리지 않는다. 탈퇴가 유일한
     * 삭제 경로이므로 여기서 행과 사진 파일을 모두 거둬야 한다(docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §1-4).
     */
    @Test
    void 탈퇴하면_나만의_하루_기록과_사진도_지운다() {
        Long me = register("withdraw-journal@fitto.com");
        Long partner = register("withdraw-journal-p@fitto.com");
        relationService.connectCouple(partner, relationService.createCoupleInvite(me).code());
        String photo = "https://res.cloudinary.com/demo/image/upload/v1/fitto/journal/withdraw.jpg";
        journalService.save(me, KstClock.today(), new SaveJournalRequest("😊", "오늘", photo, JournalSource.JOURNAL_LIST));
        journalService.save(me, KstClock.today().minusDays(1), new SaveJournalRequest(null, "어제", null, null));

        assertThatCode(() -> withdrawalService.purgeNow(me)).doesNotThrowAnyException();

        assertThat(journalEntryRepository.findByUserIdAndJournalDateBetweenOrderByJournalDateAsc(
                me, KstClock.today().minusDays(7), KstClock.today())).isEmpty();
        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(imageDeleter, atLeastOnce()).deleteAllAfterCommit(captor.capture());
        assertThat(captor.getAllValues().stream().flatMap(Collection::stream)).contains(photo);
    }

    /** 기록 사진을 바꾸거나 기록을 지우면 옛 파일을 커밋 뒤에 지운다 — 같은 스파이를 쓰려고 여기 둔다 */
    @Test
    void 기록_사진을_바꾸거나_기록을_지우면_옛_사진을_지운다() {
        Long me = register("journal-photo-swap@fitto.com");
        String first = "https://res.cloudinary.com/demo/image/upload/v1/fitto/journal/first.jpg";
        String second = "https://res.cloudinary.com/demo/image/upload/v1/fitto/journal/second.jpg";
        java.time.LocalDate today = KstClock.today();
        journalService.save(me, today, new SaveJournalRequest(null, "한 줄", first, null));
        // 본문만 고치면 사진은 그대로 — 지우지 않는다
        journalService.save(me, today, new SaveJournalRequest(null, "한 줄 더", first, null));
        verify(imageDeleter, never()).deleteAllAfterCommit(any());

        journalService.save(me, today, new SaveJournalRequest(null, "한 줄 더", second, null));
        verify(imageDeleter).deleteAllAfterCommit(List.of(first));

        journalService.delete(me, today);
        verify(imageDeleter).deleteAllAfterCommit(List.of(second));
    }
}
