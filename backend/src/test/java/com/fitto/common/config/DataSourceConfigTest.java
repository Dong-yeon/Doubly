package com.fitto.common.config;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.context.ConfigurationPropertiesAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 클라우드(Railway) DataSource 배선 — 이 경로는 로컬/테스트에서 안 타므로
 * 깨져도 <b>운영 부팅 실패로만</b> 드러난다. 그래서 여기서 따로 잡는다.
 *
 * <p>HikariDataSource 는 생성 시점에 DB 로 접속하지 않으므로 실제 서버 없이 검증할 수 있다.
 */
class DataSourceConfigTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ConfigurationPropertiesAutoConfiguration.class))
            .withUserConfiguration(DataSourceConfig.class);

    @Test
    void DATABASE_URL_이_없으면_이_빈은_아예_만들어지지_않는다() {
        runner.run(ctx -> assertThat(ctx).doesNotHaveBean(HikariDataSource.class));
    }

    @Test
    void URI_형식의_DATABASE_URL_을_JDBC_URL_과_자격증명으로_변환한다() {
        runner.withPropertyValues("DATABASE_URL=postgresql://appuser:s3cret@db.railway.internal:5433/railway")
                .run(ctx -> {
                    HikariDataSource ds = ctx.getBean(HikariDataSource.class);
                    assertThat(ds.getJdbcUrl()).isEqualTo("jdbc:postgresql://db.railway.internal:5433/railway");
                    assertThat(ds.getUsername()).isEqualTo("appuser");
                    assertThat(ds.getPassword()).isEqualTo("s3cret");
                });
    }

    @Test
    void 포트가_없으면_5432_로_채운다() {
        runner.withPropertyValues("DATABASE_URL=postgresql://u:p@host/db")
                .run(ctx -> assertThat(ctx.getBean(HikariDataSource.class).getJdbcUrl())
                        .isEqualTo("jdbc:postgresql://host:5432/db"));
    }

    /*
     * 이 빈은 DataSourceBuilder 로 직접 만들어서 오토컨피그 경로를 타지 않는다. 그래서
     * @ConfigurationProperties 를 붙이지 않으면 yml 의 spring.datasource.hikari.* 가 통째로
     * 무시되고 <b>조용히</b> Hikari 기본값(풀 10·누수 감지 꺼짐)으로 돈다 — 풀을 늘려도
     * 아무 일이 안 일어나는 상태다. 그 회귀를 여기서 잡는다.
     */
    @Test
    void hikari_설정이_실제로_적용된다() {
        runner.withPropertyValues(
                        "DATABASE_URL=postgresql://u:p@host:5432/db",
                        "spring.datasource.hikari.maximum-pool-size=25",
                        "spring.datasource.hikari.leak-detection-threshold=20000")
                .run(ctx -> {
                    HikariDataSource ds = ctx.getBean(HikariDataSource.class);
                    assertThat(ds.getMaximumPoolSize()).isEqualTo(25);
                    assertThat(ds.getLeakDetectionThreshold()).isEqualTo(20000);
                });
    }
}
