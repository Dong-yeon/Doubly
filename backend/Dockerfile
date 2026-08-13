# Doubly 백엔드 빌드/실행 (Railway 등 Dockerfile 빌드용)
# Railway: 서비스 Root Directory 를 backend 로 두면 이 Dockerfile 로 빌드한다.

# --- 빌드 단계 ---
FROM gradle:8.14.3-jdk21 AS build
WORKDIR /app
COPY --chown=gradle:gradle . .
RUN gradle clean bootJar -x test --no-daemon

# --- 실행 단계 ---
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar
# 컨테이너는 PORT 환경변수(미설정 시 8080)로 리스닝 — application.yml: server.port=${PORT:8080}
# Docker 배포 = 운영으로 간주 — prod 프로파일 활성화 (JwtSecretGuard 등 안전장치 작동).
# JWT_SECRET 미설정/약한 값이면 부팅이 의도적으로 실패한다. 필요 시 환경변수로 덮어쓰기 가능.
ENV SPRING_PROFILES_ACTIVE=prod
EXPOSE 8080
# JVM 타임존을 UTC로 명시 고정 — 베이스 이미지 기본값에 암묵적으로 기대지 않는다.
# @CreatedDate 등이 채우는 LocalDateTime은 이 타임존 기준 "벽시계 시각"이며,
# JacksonConfig가 이를 UTC로 전제하고 직렬화(...Z)한다 — 서버 타임존이 바뀌면 시간 표시가 깨진다.
ENTRYPOINT ["java", "-Duser.timezone=UTC", "-jar", "app.jar"]
