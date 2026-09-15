package com.fitto;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Fitto — 커플 운동 채팅 앱 백엔드 애플리케이션 진입점.
 * 설계서 6.2 시스템 아키텍처: Spring Boot REST API + STOMP WebSocket.
 *
 * <p>{@code @EnableScheduling} 은 여기가 아니라
 * {@link com.fitto.common.config.SchedulingConfig.ScheduledTriggers} 에 있다 — 테스트에서
 * 끌 수 있어야 하기 때문이다(그 클래스 주석 참고).
 */
@EnableJpaAuditing
@SpringBootApplication
public class FittoApplication {

    public static void main(String[] args) {
        SpringApplication.run(FittoApplication.class, args);
    }
}
