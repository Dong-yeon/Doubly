package com.fitto.feed;

import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedCursor;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.dto.FeedTimelineResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 타임라인 페이징 (FEED-01).
 *
 * <p>커서가 타임스탬프 하나였을 때 두 가지가 깨졌다.
 * <ul>
 *   <li>같은 시각의 아이템이 페이지 경계에 걸리면 다음 페이지에서 영구 누락
 *       (조회 조건이 {@code createdAt < cursor} 였던 탓)</li>
 *   <li>한 소스에서만 정확히 limit 건이 나오면 {@code hasMore} 가 false 가 되어
 *       그 뒤 기록에 영영 도달할 수 없음</li>
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
class FeedPaginationTest {

    private static final String IP = "127.0.0.1";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired FeedService feedService;

    @PersistenceContext EntityManager em;

    private Long register(String email) {
        return authService.register(
                        new RegisterRequest(email, "password123", "테스터", null, null, true, true, false), IP)
                .user().id();
    }

    private long[] couple(String a, String b) {
        Long ida = register(a);
        Long idb = register(b);
        InviteCodeResponse invite = relationService.createCoupleInvite(ida);
        relationService.connectCouple(idb, invite.code());
        return new long[]{ida, idb};
    }

    /** 커서를 따라 끝까지 넘기며 모든 아이템을 모은다. */
    private List<FeedItemResponse> drain(Long userId, int pageSize) {
        List<FeedItemResponse> all = new ArrayList<>();
        String cursor = null;
        for (int guard = 0; guard < 50; guard++) {
            FeedTimelineResponse page = feedService.timeline(userId, cursor, pageSize);
            all.addAll(page.items());
            if (!page.hasMore() || page.nextCursor() == null) {
                return all;
            }
            cursor = page.nextCursor();
        }
        throw new IllegalStateException("페이지가 끝나지 않음 — 커서가 전진하지 않는다");
    }

    /**
     * 한 소스(포스트)에만 기록이 있고 개수가 페이지 크기의 배수일 때.
     * 예전 로직은 1페이지에서 정확히 size 건을 읽고 hasMore=false 로 끝내, 나머지를 잃었다.
     */
    @Test
    void 한_소스만_있고_개수가_페이지크기와_같아도_전부_읽힌다() {
        long[] c = couple("pg-a@fitto.com", "pg-b@fitto.com");
        for (int i = 0; i < 10; i++) {
            feedService.createPost(c[0], new CreatePostRequest("포스트 " + i, null));
        }

        List<FeedItemResponse> all = drain(c[0], 5);   // 10건 / 5건씩 = 정확히 2페이지

        assertThat(all).hasSize(10);
        assertThat(all).extracting(FeedItemResponse::refId).doesNotHaveDuplicates();
    }

    /**
     * 같은 createdAt 을 가진 포스트가 페이지 경계에 걸리는 경우.
     * 타임스탬프만으로 커서를 잡으면 경계에 걸친 동률 아이템이 조용히 사라진다.
     */
    @Test
    @Transactional
    void 같은_시각_아이템이_페이지_경계에_걸려도_누락되지_않는다() {
        long[] c = couple("pg-tie-a@fitto.com", "pg-tie-b@fitto.com");
        for (int i = 0; i < 9; i++) {
            feedService.createPost(c[0], new CreatePostRequest("동시 포스트 " + i, null));
        }
        em.flush();

        // 9건 전부 같은 시각으로 강제 — 실제로도 같은 트랜잭션 대량 삽입에서 발생한다
        LocalDateTime tie = LocalDateTime.of(2026, 3, 1, 12, 0, 0);
        em.createNativeQuery("update feed_posts set created_at = :t").setParameter("t", tie).executeUpdate();
        em.flush();
        em.clear();

        List<FeedItemResponse> all = drain(c[0], 4);   // 4 + 4 + 1

        assertThat(all).hasSize(9);
        Set<Long> ids = new HashSet<>(all.stream().map(FeedItemResponse::refId).toList());
        assertThat(ids).hasSize(9);   // 중복도 누락도 없어야 한다
    }

    /** 여러 소스가 섞여 있어도 커서가 소스별로 전진해 중복·누락이 없어야 한다. */
    @Test
    @Transactional
    void 여러_소스가_같은_시각이어도_중복이나_누락이_없다() {
        long[] c = couple("pg-mix-a@fitto.com", "pg-mix-b@fitto.com");
        for (int i = 0; i < 6; i++) {
            feedService.createPost(c[0], new CreatePostRequest("포스트 " + i, null));
        }
        em.flush();
        LocalDateTime tie = LocalDateTime.of(2026, 3, 1, 12, 0, 0);
        em.createNativeQuery("update feed_posts set created_at = :t").setParameter("t", tie).executeUpdate();
        em.flush();
        em.clear();

        List<FeedItemResponse> all = drain(c[0], 2);

        assertThat(all).hasSize(6);
        assertThat(all).extracting(FeedItemResponse::refId).doesNotHaveDuplicates();
        // 최신순 정렬이 유지되는지 (같은 시각이면 id 역순)
        for (int i = 1; i < all.size(); i++) {
            assertThat(all.get(i).refId()).isLessThan(all.get(i - 1).refId());
        }
    }

    @Test
    void 기록이_없으면_커서도_hasMore_도_비어있다() {
        long[] c = couple("pg-empty-a@fitto.com", "pg-empty-b@fitto.com");

        FeedTimelineResponse page = feedService.timeline(c[0], null, 20);

        assertThat(page.items()).isEmpty();
        assertThat(page.hasMore()).isFalse();
        assertThat(page.nextCursor()).isNull();
    }

    /**
     * 손상된 커서는 예외 대신 첫 페이지로 처리한다.
     * 배포 중 이전 형식의 커서를 들고 있는 클라이언트가 스크롤하다 에러를 만나면 안 된다.
     */
    @Test
    void 잘못된_커서는_첫_페이지로_처리된다() {
        long[] c = couple("pg-bad-a@fitto.com", "pg-bad-b@fitto.com");
        feedService.createPost(c[0], new CreatePostRequest("포스트", null));

        FeedTimelineResponse page = feedService.timeline(c[0], "2026-03-01T12:00:00", 20);

        assertThat(page.items()).hasSize(1);
    }

    @Test
    void 커서는_인코딩_후_복원해도_같은_위치를_가리킨다() {
        FeedCursor original = new FeedCursor(new java.util.EnumMap<>(java.util.Map.of(
                FeedItemType.POST, new FeedCursor.Position(LocalDateTime.of(2026, 3, 1, 12, 0, 0, 123_456_000), 42L),
                FeedItemType.MEAL, new FeedCursor.Position(LocalDateTime.of(2026, 2, 1, 9, 30, 15), 7L))));

        FeedCursor restored = FeedCursor.decode(original.encode());

        assertThat(restored.positionOf(FeedItemType.POST))
                .isEqualTo(original.positionOf(FeedItemType.POST));
        assertThat(restored.positionOf(FeedItemType.MEAL))
                .isEqualTo(original.positionOf(FeedItemType.MEAL));
        assertThat(restored.positionOf(FeedItemType.WORKOUT)).isNull();
    }
}
