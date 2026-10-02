package db.migration;

import org.flywaydb.core.api.migration.Context;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * V119 채우기 — 기존 포스트의 기록일을 "올린 시각의 KST 날짜"로. 테스트 DB 는 이 마이그레이션 시점에 포스트가
 * 비어 있어 통합 테스트로는 채우기 경로가 한 번도 돌지 않는다. 그래서 빈 H2 에 옛 모양의 표를 만들고 직접 돌린다.
 * 운영은 JVM 이 UTC 라 그 경우를 따로 본다(KST 00~09시가 전날로 밀리는지가 핵심). JVM 시간대는 바꾸지 않는다 —
 * H2 드라이버가 기본 시간대를 캐시해서 테스트 사이에 바꾸면 엉뚱한 날이 나온다(실제로 그렇게 한 번 빨갰다).
 */
class V119FeedPostRecordDateTest {

    private Connection freshDb(String name) throws Exception {
        Connection conn = DriverManager.getConnection("jdbc:h2:mem:" + name + ";DB_CLOSE_DELAY=-1", "sa", "");
        try (Statement st = conn.createStatement()) {
            st.execute("CREATE TABLE feed_posts (id BIGINT PRIMARY KEY, couple_id BIGINT NOT NULL, created_at TIMESTAMP NOT NULL)");
        }
        return conn;
    }

    /** Flyway 가 부르는 입구 그대로 — 저장 시간대는 JVM 기본(테스트 JVM 은 Asia/Seoul 고정) */
    private void migrate(Connection conn) throws Exception {
        Context context = mock(Context.class);
        when(context.getConnection()).thenReturn(conn);
        new V119__feed_post_record_date().migrate(context);
    }

    private String recordDateOf(Connection conn, long id) throws Exception {
        try (Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT record_date FROM feed_posts WHERE id = " + id)) {
            rs.next();
            return rs.getObject(1, java.time.LocalDate.class).toString();
        }
    }

    @Test
    void 저장_TZ_가_KST_면_올린_날_그대로() throws Exception {
        try (Connection conn = freshDb("v118kst")) {
            try (Statement st = conn.createStatement()) {
                st.execute("INSERT INTO feed_posts VALUES (1, 7, TIMESTAMP '2026-10-01 23:30:00')");
                st.execute("INSERT INTO feed_posts VALUES (2, 7, TIMESTAMP '2026-10-02 00:10:00')");
            }
            migrate(conn);
            assertThat(recordDateOf(conn, 1)).isEqualTo("2026-10-01");
            assertThat(recordDateOf(conn, 2)).isEqualTo("2026-10-02");
        }
    }

    @Test
    void 운영처럼_UTC_로_저장됐으면_KST_날짜로_옮긴다() throws Exception {
        try (Connection conn = freshDb("v118utc")) {
            try (Statement st = conn.createStatement()) {
                // UTC 14:59 = KST 23:59(같은 날), UTC 15:00 = KST 다음 날 00:00
                st.execute("INSERT INTO feed_posts VALUES (1, 7, TIMESTAMP '2026-10-01 14:59:00')");
                st.execute("INSERT INTO feed_posts VALUES (2, 7, TIMESTAMP '2026-10-01 15:00:00')");
            }
            new V119__feed_post_record_date().migrate(conn, java.time.ZoneOffset.UTC);
            assertThat(recordDateOf(conn, 1)).isEqualTo("2026-10-01");
            assertThat(recordDateOf(conn, 2)).isEqualTo("2026-10-02");
        }
    }

    @Test
    void 채운_뒤에는_NOT_NULL_이다() throws Exception {
        try (Connection conn = freshDb("v118nn")) {
            migrate(conn);
            assertThatThrownBy(() -> {
                try (Statement st = conn.createStatement()) {
                    st.execute("INSERT INTO feed_posts (id, couple_id, created_at) VALUES (9, 7, CURRENT_TIMESTAMP)");
                }
            }).hasMessageContaining("RECORD_DATE");
        }
    }
}
