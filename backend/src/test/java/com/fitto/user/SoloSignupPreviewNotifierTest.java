package com.fitto.user;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import com.fitto.user.service.SoloSignupPreviewNotifier;
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
import java.util.concurrent.atomic.AtomicInteger;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 혼자 가입자 D+1·D+3 프리뷰 리마인드 (SoloSignupPreviewNotifier) — 대상 판별 + 중복 방지.
 * 저장 TZ 를 UTC 로 못박는다({@code MemoriesNotifierTest} 와 같은 이유).
 * 절대 개수로 단언하지 않고 이 테스트가 만든 사용자 id 기준으로만 검증한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@TestPropertySource(properties = "fitto.storage-zone=UTC")
class SoloSignupPreviewNotifierTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 8, 20);
    private static final AtomicInteger IP_SEQ = new AtomicInteger();

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired SoloSignupPreviewNotifier notifier;

    @MockitoBean NotificationService notificationService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false),
                        "10.42.0." + IP_SEQ.incrementAndGet())
                .user().id();
    }

    /**
     * 가입일을 임의 시점으로 못박는다 — UTC 저장 규칙이므로 정오로 찍으면 KST 날짜와 항상 일치한다.
     * executeUpdate() 는 트랜잭션이 필요하므로 이 메서드를 부르는 @Test 쪽에 @Transactional 을 둔다.
     */
    private void joinedAt(Long userId, LocalDate kstDate) {
        em.createNativeQuery("update users set created_at = :t where id = :id")
                .setParameter("t", kstDate.atTime(3, 0)) // KST 정오 = UTC 03시
                .setParameter("id", userId)
                .executeUpdate();
        em.flush();
        em.clear();
    }

    @Test
    @Transactional
    void 어제_가입한_혼자인_사람은_D1_프리뷰를_받는다() {
        Long user = register("solo-d1@fitto.com");
        joinedAt(user, TODAY.minusDays(1));

        notifier.notifySoloSignups(TODAY);

        verify(notificationService).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void 삼일_전_가입한_혼자인_사람은_D3_프리뷰를_받는다() {
        Long user = register("solo-d3@fitto.com");
        joinedAt(user, TODAY.minusDays(3));

        notifier.notifySoloSignups(TODAY);

        verify(notificationService).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void 커플_연결된_사람은_대상에서_빠진다() {
        Long a = register("solo-couple-a@fitto.com");
        Long b = register("solo-couple-b@fitto.com");
        joinedAt(a, TODAY.minusDays(1));
        joinedAt(b, TODAY.minusDays(1));
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        relationService.connectCouple(b, invite.code());

        notifier.notifySoloSignups(TODAY);

        verify(notificationService, never()).notify(eq(a), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
        verify(notificationService, never()).notify(eq(b), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void 이미_초대코드만_만든_사람도_대상에서_빠진다() {
        Long user = register("solo-pending@fitto.com");
        joinedAt(user, TODAY.minusDays(1));
        relationService.createCoupleInvite(user); // 아직 아무도 안 들어옴 — PENDING 관계만 존재

        notifier.notifySoloSignups(TODAY);

        verify(notificationService, never()).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void D1_D3가_아닌_날짜_가입자는_대상이_아니다() {
        Long user = register("solo-wrong-day@fitto.com");
        joinedAt(user, TODAY.minusDays(2)); // D+2 는 대상 아님

        notifier.notifySoloSignups(TODAY);

        verify(notificationService, never()).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }

    @Test
    @Transactional
    void 같은_날짜에_두_번_돌아도_중복_발송되지_않는다() {
        Long user = register("solo-dedup@fitto.com");
        joinedAt(user, TODAY.minusDays(1));

        notifier.notifySoloSignups(TODAY);
        notifier.notifySoloSignups(TODAY); // 재실행(예: 배포 재시작) 시나리오

        verify(notificationService, times(1)).notify(eq(user), eq(NotificationCategory.REMINDER),
                anyString(), anyString(), any());
    }
}
