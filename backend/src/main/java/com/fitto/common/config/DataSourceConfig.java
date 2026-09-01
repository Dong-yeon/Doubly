package com.fitto.common.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.net.URI;

/**
 * 클라우드(예: Railway)는 DATABASE_URL 을 URI 형식
 * (postgresql://user:pass@host:port/db)으로 주입한다. JDBC URL + 자격증명으로 변환해
 * DataSource 를 구성한다.
 *
 * DATABASE_URL 이 없으면(로컬 개발) 이 빈은 생성되지 않고, application.yml 의
 * spring.datasource.* (DB_HOST/PORT/...) 설정으로 기본 오토컨피그가 동작한다.
 *
 * <p><b>{@code @ConfigurationProperties("spring.datasource.hikari")} 가 필요한 이유</b>:
 * {@link DataSourceBuilder} 로 직접 만든 DataSource 는 오토컨피그 경로를 타지 않아서
 * <b>yml 의 hikari 설정이 통째로 무시된다</b>. 즉 이게 없으면 운영은 항상 Hikari 기본값
 * (풀 10개·누수 감지 없음)으로 돌고, 풀을 늘리거나 누수 감지를 켜도 아무 일도 일어나지 않는다.
 * 실제로 AI 호출이 커넥션을 오래 쥐던 문제를 이 침묵 때문에 오래 못 봤다.
 */
@Configuration
@ConditionalOnProperty(name = "DATABASE_URL")
public class DataSourceConfig {

    @Bean
    @ConfigurationProperties("spring.datasource.hikari")
    public HikariDataSource dataSource(Environment env) {
        String databaseUrl = env.getProperty("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank()) {
            throw new IllegalStateException("DATABASE_URL 이 비어 있습니다.");
        }

        URI uri = URI.create(databaseUrl);

        String username = null;
        String password = null;
        String userInfo = uri.getUserInfo();
        if (userInfo != null) {
            String[] credentials = userInfo.split(":", 2);
            username = credentials[0];
            password = credentials.length > 1 ? credentials[1] : "";
        }

        int port = uri.getPort() == -1 ? 5432 : uri.getPort();
        StringBuilder jdbcUrl = new StringBuilder("jdbc:postgresql://")
                .append(uri.getHost())
                .append(':')
                .append(port)
                .append(uri.getPath());
        if (uri.getQuery() != null) {
            jdbcUrl.append('?').append(uri.getQuery());
        }

        return DataSourceBuilder.create()
                .type(HikariDataSource.class)
                .driverClassName("org.postgresql.Driver")
                .url(jdbcUrl.toString())
                .username(username)
                .password(password)
                .build();
    }
}
