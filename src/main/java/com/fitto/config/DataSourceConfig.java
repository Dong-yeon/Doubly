package com.fitto.config;

import com.zaxxer.hikari.HikariDataSource;
import java.net.URI;
import javax.sql.DataSource;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * DATABASE_URL 환경변수가 URI 형식(예: postgresql://user:pass@host:5432/db)으로 들어오므로,
 * Spring 의 datasource 가 요구하는 JDBC URL + username/password 로 변환해 DataSource 를 구성한다.
 */
@Configuration
public class DataSourceConfig {

    private final Environment env;

    public DataSourceConfig(Environment env) {
        this.env = env;
    }

    @Bean
    public DataSource dataSource() {
        String databaseUrl = env.getProperty("DATABASE_URL");
        if (databaseUrl == null || databaseUrl.isBlank()) {
            throw new IllegalStateException("DATABASE_URL 환경변수가 설정되어 있지 않습니다.");
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
