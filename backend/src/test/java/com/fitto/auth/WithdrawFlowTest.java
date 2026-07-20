package com.fitto.auth;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.challenge.domain.ChallengeType;
import com.fitto.challenge.dto.CreateChallengeRequest;
import com.fitto.challenge.service.CoupleChallengeService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.service.FeedService;
import com.fitto.place.dto.SavePlaceRequest;
import com.fitto.place.service.PlaceService;
import com.fitto.question.dto.AnswerRequest;
import com.fitto.question.service.DailyQuestionService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.trip.dto.SaveTripRequest;
import com.fitto.trip.service.TripService;
import com.fitto.user.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * 회원 탈퇴 — AUTH-06.
 *
 * <p>탈퇴는 users / relations 를 참조하는 모든 테이블을 먼저 정리해야 한다.
 * 하나라도 빠지면 외래키 위반으로 탈퇴 자체가 실패한다.
 * 이 테스트는 실제 마이그레이션 스키마(외래키 포함)에서 돌아야 의미가 있다
 * — application-test.yml 에서 Flyway 를 켜둔 이유다.
 */
@SpringBootTest
@ActiveProfiles("test")
class WithdrawFlowTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired PlaceService placeService;
    @Autowired FeedService feedService;
    @Autowired TripService tripService;
    @Autowired CoupleChallengeService challengeService;
    @Autowired DailyQuestionService dailyQuestionService;
    @Autowired BodyMetricService bodyMetricService;
    @Autowired UserRepository userRepository;

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
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null));
        feedService.createPost(me, new CreatePostRequest("오늘의 기록", null));
        tripService.save(me, new SaveTripRequest(
                "여행", LocalDate.now(), LocalDate.now().plusDays(2), null, null));
        challengeService.create(me, new CreateChallengeRequest(
                ChallengeType.WORKOUT, "챌린지", LocalDate.now(), LocalDate.now().plusDays(7), null));
        dailyQuestionService.answer(me, new AnswerRequest("오늘의 답변"));

        // users 를 참조하는 개인 데이터
        bodyMetricService.save(me, new SaveBodyMetricRequest(
                LocalDate.now(), new BigDecimal("70.0"), null, null, null, null));

        assertThatCode(() -> authService.withdraw(me)).doesNotThrowAnyException();
        assertThat(userRepository.findById(me)).isEmpty();
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
                "맛집", "서울", new BigDecimal("37.5"), new BigDecimal("127.0"), null, null));
        feedService.createPost(partner, new CreatePostRequest("상대의 기록", null));

        authService.withdraw(me);
        assertThat(userRepository.findById(partner)).isPresent();

        assertThatCode(() -> authService.withdraw(partner)).doesNotThrowAnyException();
        assertThat(userRepository.findById(partner)).isEmpty();
    }

    @Test
    void 커플_연결이_없는_계정도_탈퇴할_수_있다() {
        Long solo = register("withdraw-solo@fitto.com");
        bodyMetricService.save(solo, new SaveBodyMetricRequest(
                LocalDate.now(), new BigDecimal("65.0"), null, null, null, null));

        assertThatCode(() -> authService.withdraw(solo)).doesNotThrowAnyException();
        assertThat(userRepository.findById(solo)).isEmpty();
    }
}
