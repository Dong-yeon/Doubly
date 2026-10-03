package com.fitto.diet;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.body.dto.BodyMetricResponse;
import com.fitto.body.dto.SaveBodyMetricRequest;
import com.fitto.body.service.BodyMetricService;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.time.KstClock;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.MealResponse;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.relation.service.RelationService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Cloudinary 고아 파일(lovebody-current-state §4-6) — 기록을 고치거나 지울 때 더는 안 쓰는 사진을 커밋 뒤에 지운다.
 *
 * <p>목·스파이 구성을 {@code WithdrawFlowTest} 와 똑같이 맞췄다(알림 목 + 삭제기 스파이) — 스프링 컨텍스트가 늘지 않는다.
 * 테스트 프로필은 Cloudinary 미설정이라 실제 삭제는 일어나지 않고, 어떤 URL 을 넘기는지만 본다.
 */
@SpringBootTest
@ActiveProfiles("test")
class MealPhotoCleanupTest {

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired MealService mealService;
    @Autowired BodyMetricService bodyMetricService;

    @MockitoBean NotificationService notificationService;
    @MockitoSpyBean CloudinaryImageDeleter imageDeleter;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), "127.0.0.1").user().id();
    }

    private static String photo(String name) {
        return "https://res.cloudinary.com/demo/image/upload/v1/fitto/" + name + ".jpg";
    }

    /** 칼로리를 채워 둔다 — 자동 분석 대상이 되면 백그라운드 작업이 이 테스트와 무관하게 돈다 */
    private SaveMealRequest meal(String photoUrl, boolean shared) {
        return new SaveMealRequest(KstClock.today(), MealType.LUNCH, "비빔밥", photoUrl, 600,
                null, null, null, null, null, null, null, shared);
    }

    @SuppressWarnings("unchecked")
    private List<String> scheduledDeletions() {
        ArgumentCaptor<Collection<String>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(imageDeleter, atLeastOnce()).deleteAllAfterCommit(captor.capture());
        return captor.getAllValues().stream().flatMap(Collection::stream).toList();
    }

    @Test
    void 식단_사진을_바꾸면_예전_사진을_지운다() {
        Long user = register("cleanup-swap@fitto.com");
        MealResponse saved = mealService.save(user, meal(photo("old-lunch"), false));

        mealService.update(user, saved.id(), meal(photo("new-lunch"), false));

        assertThat(scheduledDeletions()).contains(photo("old-lunch")).doesNotContain(photo("new-lunch"));
        assertThat(imageDeleter.deletable(List.of(photo("old-lunch")))).as("더는 아무 행도 안 쓴다").hasSize(1);
    }

    @Test
    void 식단_사진을_빼도_예전_사진을_지운다() {
        Long user = register("cleanup-remove@fitto.com");
        MealResponse saved = mealService.save(user, meal(photo("removed-lunch"), false));

        mealService.update(user, saved.id(), meal(null, false));

        assertThat(scheduledDeletions()).contains(photo("removed-lunch"));
    }

    @Test
    void 사진을_그대로_두고_고치면_아무것도_지우지_않는다() {
        Long user = register("cleanup-keep@fitto.com");
        MealResponse saved = mealService.save(user, meal(photo("kept-lunch"), false));
        clearInvocations(imageDeleter);

        mealService.update(user, saved.id(), meal(photo("kept-lunch"), false));

        verify(imageDeleter, never()).deleteAllAfterCommit(any());
    }

    /** 데이트 식단 — 짝 동기화가 상대 몫 사진도 새 것으로 바꾸므로 예전 파일을 쥔 행이 남지 않는다 */
    @Test
    void 데이트_식단_사진을_바꾸면_상대_몫도_새_사진이고_예전_파일은_지울_수_있다() {
        Long a = register("cleanup-date-a@fitto.com");
        Long b = register("cleanup-date-b@fitto.com");
        relationService.connectCouple(b, relationService.createCoupleInvite(a).code());
        MealResponse mine = mealService.save(a, meal(photo("date-old"), true));

        mealService.update(a, mine.id(), meal(photo("date-new"), false));

        assertThat(mealService.findToday(b).get(0).photoUrl()).isEqualTo(photo("date-new"));
        assertThat(scheduledDeletions()).contains(photo("date-old"));
        assertThat(imageDeleter.deletable(List.of(photo("date-old")))).hasSize(1);
    }

    @Test
    void 몸_변화_기록을_지우면_사진도_지운다() {
        Long user = register("cleanup-body@fitto.com");
        BodyMetricResponse saved = bodyMetricService.save(user, new SaveBodyMetricRequest(
                KstClock.today(), new BigDecimal("60.0"), null, null, photo("body-front"), null));

        bodyMetricService.delete(user, saved.id());

        assertThat(scheduledDeletions()).contains(photo("body-front"));
    }
}
