package db.migration;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * V119 — 일상 포스트에 기록일(record_date)을 둔다.
 *
 * <p>지금까지 포스트의 "날짜"는 올린 시각이었다. 어젯밤 일을 오늘 아침 올리면 오늘 기록이 되고, 날짜를
 * 고르는 식단·운동·방문과 사진첩·작년 오늘에서 기준이 섞였다(docs/daily-mood-current-state.md §8-1).
 *
 * <p><b>SQL 이 아니라 Java 인 이유</b>: 기존 행을 채우려면 created_at 이 어느 시간대 벽시계인지 알아야 한다.
 * {@code @CreatedDate} 는 JVM 기본 시간대로 적으므로 운영(UTC)과 로컬·테스트(Asia/Seoul)가 다르다.
 * 날짜 연산·시간대 변환 문법도 H2 와 PostgreSQL 이 갈라진다(CLAUDE.md 4절). 앱이 쓰던 규칙
 * ({@code FeedService.recordDateOf} — 기본 시간대로 읽어 KST 날짜로)을 여기서 그대로 쓰면 두 DB·두 환경에서
 * 같은 결과가 나온다. 남은 DDL 은 두 DB 가 함께 받는 표준 문법만 쓴다.
 */
public class V119__feed_post_record_date extends BaseJavaMigration {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Override
    public void migrate(Context context) throws Exception {
        migrate(context.getConnection(), ZoneId.systemDefault());
    }

    /**
     * @param storage created_at 을 적은 시간대 — {@code @CreatedDate} 의 JVM 기본 시간대. 테스트가 JVM 시간대를
     *                바꾸지 않고 운영(UTC)을 재현하려고 따로 받는다(드라이버가 기본 시간대를 캐시해 바꿔도 안 먹는다).
     */
    void migrate(Connection conn, ZoneId storage) throws Exception {
        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE feed_posts ADD COLUMN record_date DATE");
        }

        try (Statement select = conn.createStatement();
             ResultSet rows = select.executeQuery("SELECT id, created_at FROM feed_posts");
             PreparedStatement update = conn.prepareStatement("UPDATE feed_posts SET record_date = ? WHERE id = ?")) {
            int batched = 0;
            while (rows.next()) {
                // 벽시계 그대로 읽는다 — getTimestamp 는 드라이버가 기본 시간대로 한 번 더 옮길 수 있다
                LocalDateTime createdAt = rows.getObject("created_at", LocalDateTime.class);
                LocalDate date = createdAt.atZone(storage).withZoneSameInstant(KST).toLocalDate();
                update.setObject(1, date);
                update.setLong(2, rows.getLong("id"));
                update.addBatch();
                if (++batched % 500 == 0) {
                    update.executeBatch();
                }
            }
            update.executeBatch();
        }

        try (Statement st = conn.createStatement()) {
            st.execute("ALTER TABLE feed_posts ALTER COLUMN record_date SET NOT NULL");
            // 사진첩(기록일 순 keyset)·사진첩 달력·작년 오늘이 커플 + 기록일로 찾는다
            st.execute("CREATE INDEX idx_feed_posts_couple_record ON feed_posts (couple_id, record_date DESC, created_at DESC)");
        }
    }
}
