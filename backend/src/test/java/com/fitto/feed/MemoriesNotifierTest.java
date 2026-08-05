package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.feed.service.MemoriesNotifier;
import com.fitto.feed.service.MemoriesNotifier.CoupleMemory;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * 추억 리마인드 아침 푸시 (PLAN.md Memories) — 대상 판별과 발송 경로.
 *
 * <p>{@code MemoriesFlowTest} 와 같은 이유로 저장 TZ 를 UTC 로 못박는다.
 *
 * <p><b>절대 개수로 단언하지 않는다.</b> 테스트 클래스들이 같은 인메모리 H2 를 공유하므로
 * ({@code DB_CLOSE_DELAY=-1}) 다른 클래스가 만든 커플이 대상에 섞여 들어온다.
 * 판정은 항상 이 테스트가 만든 커플 id · 사용자 id 기준으로만 한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "fitto.storage-zone=UTC")
class MemoriesNotifierTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 7, 30);
    private static final AtomicInteger IP_SEQ = new AtomicInteger();

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;
    @Autowired MemoriesNotifier notifier;
    @Autowired RelationRepository relationRepository;

    /** 실제 Expo 발송 대신 호출만 기록한다 — 발송 대상·문구를 그대로 검증할 수 있다. */
    @MockitoBean NotificationService notificationService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                        "10.40.0." + IP_SEQ.incrementAndGet())
                .user().id();
    }

    private long[] couple(String a, String b) {
        Long ida = register(a);
        Long idb = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ida);
        relationService.connectCouple(idb, invite.code());
        return new long[]{ida, idb};
    }

    private Long coupleIdOf(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, com.fitto.relation.domain.RelationType.COUPLE,
                        com.fitto.relation.domain.RelationStatus.ACTIVE)
                .get(0).getId();
    }

    private void postAt(Long userId, String content, LocalDateTime storedAt) {
        FeedItemResponse post = feedService.createPost(userId, new CreatePostRequest(content, null));
        em.flush();
        em.createNativeQuery("update feed_posts set created_at = :t where id = :id")
                .setParameter("t", storedAt)
                .setParameter("id", post.refId())
                .executeUpdate();
        em.flush();
        em.clear();
    }

    // ---- 대상 판별 ----

    /**
     * 여러 해에 기록이 있으면 <b>가장 오래된 해</b>를 고르고, 개수도 그 해 것만 센다.
     * 합산하면 "3년 전 오늘"이라 해놓고 작년 기록까지 세는 문구가 된다.
     */
    @Test
    @Transactional
    void 가장_오래된_해가_선택되고_그_해의_개수만_센다() {
        long[] c = couple("nt-a@fitto.com", "nt-b@fitto.com");
        Long coupleId = coupleIdOf(c[0]);
        postAt(c[0], "3년 전 하나", LocalDateTime.of(2023, 7, 30, 3, 0));
        postAt(c[0], "1년 전 하나", LocalDateTime.of(2025, 7, 30, 3, 0));
        postAt(c[1], "1년 전 둘", LocalDateTime.of(2025, 7, 30, 4, 0));

        Map<Long, CoupleMemory> targets = notifier.memoriesOn(TODAY);

        assertThat(targets).containsKey(coupleId);
        assertThat(targets.get(coupleId)).isEqualTo(new CoupleMemory(3, 1));
    }

    @Test
    @Transactional
    void 올해_기록만_있는_커플은_대상이_아니다() {
        long[] c = couple("nt-c@fitto.com", "nt-d@fitto.com");
        Long coupleId = coupleIdOf(c[0]);
        postAt(c[0], "올해 기록", LocalDateTime.of(2026, 7, 30, 3, 0));
        postAt(c[0], "작년 다른 날", LocalDateTime.of(2025, 7, 29, 3, 0));

        assertThat(notifier.memoriesOn(TODAY)).doesNotContainKey(coupleId);
    }

    @Test
    @Transactional
    void 윤년_보정된_날짜의_기록도_대상에_잡힌다() {
        long[] c = couple("nt-leap-a@fitto.com", "nt-leap-b@fitto.com");
        Long coupleId = coupleIdOf(c[0]);
        postAt(c[0], "윤날의 기록", LocalDateTime.of(2024, 2, 29, 3, 0));

        Map<Long, CoupleMemory> targets = notifier.memoriesOn(LocalDate.of(2026, 2, 28));

        assertThat(targets.get(coupleId)).isEqualTo(new CoupleMemory(2, 1));
    }

    // ---- 발송 ----

    @Test
    @Transactional
    void 커플_양쪽에_같은_문구로_보낸다() {
        long[] c = couple("nt-send-a@fitto.com", "nt-send-b@fitto.com");
        postAt(c[0], "작년 오늘", LocalDateTime.of(2025, 7, 30, 3, 0));
        postAt(c[1], "작년 오늘 둘", LocalDateTime.of(2025, 7, 30, 4, 0));

        notifier.notifyTodayMemories(LocalDate.of(2026, 7, 30));

        String body = "1년 전 오늘, 둘이 함께한 기록이 2개 있어요 💐";
        verify(notificationService).notify(eq(c[0]), eq("우리 추억"), eq(body));
        verify(notificationService).notify(eq(c[1]), eq("우리 추억"), eq(body));
    }

    /** 연결이 끊긴 관계의 기록은 보이지 않는 상태다 — 알림도 가면 안 된다. */
    @Test
    @Transactional
    void 끊긴_관계에는_보내지_않는다() {
        long[] c = couple("nt-end-a@fitto.com", "nt-end-b@fitto.com");
        postAt(c[0], "헤어지기 전 기록", LocalDateTime.of(2025, 7, 30, 3, 0));
        relationService.endRelation(c[0], coupleIdOf(c[0]));
        em.flush();
        em.clear();

        notifier.notifyTodayMemories(LocalDate.of(2026, 7, 30));

        // 제목으로 좁힌다 — 포스트 작성 시 상대에게 가는 알림이 이미 기록돼 있다
        verify(notificationService, never()).notify(eq(c[0]), eq("우리 추억"), any());
        verify(notificationService, never()).notify(eq(c[1]), eq("우리 추억"), any());
    }
}
