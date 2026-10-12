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
# JVM 메모리 상한 (2026-10-12) — Railway 요금의 98% 가 메모리다. 상한이 없으면 JVM 은 컨테이너가 보여주는
# 8GB 의 1/4 까지 힙을 키우고 잘 돌려주지 않아, 사용자 두 명짜리 서버가 평균 2.7GB 를 잡고 있었다(월 $27 상당).
# JAVA_TOOL_OPTIONS 는 JVM 이 직접 읽으므로 Railway 변수에 같은 이름을 넣으면 코드 배포 없이 덮어쓴다 —
# 메모리 부족(OutOfMemoryError)이 보이면 거기서 -Xmx 만 올리면 된다. 측정 근거: docs/railway-cost_2026-10-12.md
ENV JAVA_TOOL_OPTIONS="-Xmx384m -Xss512k -XX:MaxMetaspaceSize=192m -XX:ReservedCodeCacheSize=64m -XX:MaxDirectMemorySize=64m -XX:+UseSerialGC -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
# JVM 타임존을 UTC로 명시 고정 — 베이스 이미지 기본값에 암묵적으로 기대지 않는다.
# @CreatedDate 등이 채우는 LocalDateTime은 이 타임존 기준 "벽시계 시각"이며,
# JacksonConfig가 이를 UTC로 전제하고 직렬화(...Z)한다 — 서버 타임존이 바뀌면 시간 표시가 깨진다.
ENTRYPOINT ["java", "-Duser.timezone=UTC", "-jar", "app.jar"]
