package com.fitto;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Fitto — 커플 운동 채팅 앱 백엔드 애플리케이션 진입점.
 * 설계서 6.2 시스템 아키텍처: Spring Boot REST API + STOMP WebSocket.
 */
@EnableJpaAuditing
@EnableScheduling
@SpringBootApplication
public class FittoApplication {

    public static void main(String[] args) {
        SpringApplication.run(FittoApplication.class, args);
    }
}
