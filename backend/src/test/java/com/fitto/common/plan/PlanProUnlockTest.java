package com.fitto.common.plan;

// Plan·Subscription·SubscriptionRepository 는 같은 패키지(com.fitto.common.plan)라 임포트가 없다
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.diet.domain.MealType;
import com.fitto.diet.dto.SaveMealRequest;
import com.fitto.diet.service.MealService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.MemoriesResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 같은 기능을 FREE 와 PRO 로 <b>나란히</b> 확인한다.
 *
 * <p>왜 따로 만드나: {@link PlanGatingFlowTest} 는 "무료에서 잠긴다"만 본다. 잠금이
 * 걸린 것은 증명되지만 <b>돈을 낸 계정에서 실제로 열리는지</b>는 아무 테스트도 보지 않았다.
 * 잠금 조건을 잘못 뒤집어 놓으면(예: 항상 locked) FREE 테스트는 전부 통과한다.
 *
 * <p>무료 체험 플래그를 끄고 돈다 — 켜진 상태에서는 전원 PRO 라 분기가 실행되지 않는다
 * ({@link PlanFlowTest} 와 같은 이유).
 */
@SpringBootTest(properties = "fitto.plan.free-trial=false")
@ActiveProfiles("test")
@Transactional
class PlanProUnlockTest {

    private static final String IP = "127.0.0.1";
    /** 추억 기준일 — 고정 날짜로 둔다(오늘에 의존하면 자정·연말에 깨진다) */
    private static final LocalDate ON = LocalDate.of(2026, 7, 30);

    @Autowired
    AuthService authService;
    @Autowired
    RelationService relationService;
    @Autowired
    FeedService feedService;
    @Autowired
    MemoriesService memoriesService;
    @Autowired
    MealService mealService;
    @Autowired
    SubscriptionRepository subscriptionRepository;
    @Autowired
    EntityManager em;

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", "U", null, null, true, true, false), IP)
                .user().id();
    }

    /** 연결된 커플을 만들고 A 의 id 를 돌려준다 */
    private long[] couple(String emailA, String emailB) {
        Long a = register(emailA);
        Long b = register(emailB);
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());
        return new long[]{a, b};
    }

    private void givePro(Long userId) {
        subscriptionRepository.save(Subscription.builder()
                .userId(userId)
                .plan(Plan.PRO)
                .status(SubscriptionStatus.ACTIVE)
                .store(Store.MANUAL)
                .productId("doubly.pro.monthly")
                .purchaseToken("token-" + userId)
                .startedAt(LocalDateTime.now().minusDays(1))
                .expiresAt(LocalDateTime.now().plusDays(30))
                .build());
    }

    /** 1년 전 같은 날의 포스트 — created_at 을 직접 밀어 넣는다(MemoriesFlowTest 와 같은 방식) */
    private void postLastYear(Long userId, String content) {
        FeedItemResponse post = feedService.createPost(userId, new CreatePostRequest(content, null));
        em.flush();
        em.createNativeQuery("update feed_posts set created_at = :t where id = :id")
                .setParameter("t", LocalDateTime.of(2025, 7, 30, 3, 0))   // UTC 03:00 = KST 12:00
                .setParameter("id", post.refId())
                .executeUpdate();
        em.flush();
        em.clear();
    }

    @Test
    void 작년_오늘은_FREE_에서_잠기고_PRO_에서_열린다() {
        long[] free = couple("pro-mem-free-a@fitto.com", "pro-mem-free-b@fitto.com");
        postLastYear(free[0], "작년 한강");

        MemoriesResponse asFree = memoriesService.memories(free[0], ON);

        // 홈·우리 탭이 매일 부르는 조회다 — 402 가 아니라 잠김 표시로 내려와야 한다
        assertThat(asFree.locked()).isTrue();
        assertThat(asFree.groups()).isEmpty();
        assertThat(asFree.totalCount()).isZero();

        long[] pro = couple("pro-mem-pro-a@fitto.com", "pro-mem-pro-b@fitto.com");
        postLastYear(pro[0], "작년 한강");
        givePro(pro[0]);

        MemoriesResponse asPro = memoriesService.memories(pro[0], ON);

        assertThat(asPro.locked()).isFalse();
        assertThat(asPro.totalCount()).isEqualTo(1);
        assertThat(asPro.groups()).hasSize(1);
        assertThat(asPro.groups().get(0).label()).isEqualTo("1년 전 오늘");
    }

    /**
     * 사진첩("우리" 탭)은 <b>플랜과 무관</b>해야 한다 — 내가 남긴 기록을 다시 보는 일이
     * 유료가 되면 탭 자체가 무의미해진다. 잠기는 건 그 안의 작년 오늘 섹션뿐이다.
     */
    @Test
    void 사진첩은_FREE_와_PRO_모두_같은_사진을_내려준다() {
        long[] free = couple("pro-photo-free-a@fitto.com", "pro-photo-free-b@fitto.com");
        feedService.createPost(free[0], new CreatePostRequest("일상", "https://img.example.com/p.jpg"));
        mealService.save(free[0], new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "점심",
                "https://img.example.com/m.jpg", 600, null, null, null, null, null, null, null));

        var asFree = feedService.photos(free[0], null, 20, null);

        assertThat(asFree.items()).extracting(p -> p.type())
                .containsExactlyInAnyOrder(FeedItemType.POST, FeedItemType.MEAL);

        long[] pro = couple("pro-photo-pro-a@fitto.com", "pro-photo-pro-b@fitto.com");
        givePro(pro[0]);
        feedService.createPost(pro[0], new CreatePostRequest("일상", "https://img.example.com/p.jpg"));
        mealService.save(pro[0], new SaveMealRequest(LocalDate.now(), MealType.LUNCH, "점심",
                "https://img.example.com/m.jpg", 600, null, null, null, null, null, null, null));

        var asPro = feedService.photos(pro[0], null, 20, null);

        assertThat(asPro.items()).extracting(p -> p.type())
                .containsExactlyInAnyOrder(FeedItemType.POST, FeedItemType.MEAL);
        // 소스 필터도 플랜과 무관하게 같은 규칙으로 동작한다
        assertThat(feedService.photos(free[0], null, 20, List.of(FeedItemType.MEAL)).items()).hasSize(1);
        assertThat(feedService.photos(pro[0], null, 20, List.of(FeedItemType.MEAL)).items()).hasSize(1);
    }
}
