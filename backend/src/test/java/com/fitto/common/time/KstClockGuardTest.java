package com.fitto.common.time;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.TimeZone;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "오늘"의 기준이 <b>KST 한 곳</b>으로 모여 있는지 지킨다 — 두 가지를 본다.
 *
 * <p><b>배경</b>: 이 앱의 하루는 정의상 KST 다({@link KstClock} 주석). 그런데 존을 지정하지
 * 않은 {@code LocalDate.now()} 는 JVM 기본 시간대를 따르므로, UTC 로 도는 서버·CI 에서는
 * 한국 00:00~09:00 사이에 "어제"를 오늘이라고 답한다. 2026-09-15 까지 CI 는 매일
 * 15:00~24:00 UTC 구간에서 "오늘_…" 계열 테스트 20여 건이 통째로 깨진 채 빨갰고, 같은
 * 커밋이 자정을 넘기면 그대로 초록이었다 — 한국 새벽~오전에 올린 커밋은 전부 빨갛게 보였다.
 * 원인은 <b>테스트는 존 없는 now(), 서비스는 KstClock</b> 이라는 어긋남이었다.
 *
 * <p>해결은 build.gradle 에서 테스트 JVM 시간대를 KST 로 고정하는 것인데, 그렇게 하면
 * <b>운영 코드가 존 없는 now() 를 쓰는 진짜 버그가 테스트에서 안 보이게 된다</b>(개발 PC 도
 * KST 라 원래 안 보였다). 그래서 고정과 금지를 같은 테스트가 함께 지킨다.
 */
class KstClockGuardTest {

    /** 소스를 훑을 뿌리 — 테스트 실행 위치가 backend/ 라 상대경로로 닿는다 */
    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");

    /**
     * 테스트 시계가 KST 인지 — build.gradle 의 고정이 실제로 먹었는지 본다.
     *
     * <p>이 단정이 값을 갖는 자리는 <b>CI</b> 다. 개발 PC 는 이미 KST 라 고정이 풀려도
     * 통과하지만, UTC 러너에서는 고정이 풀리는 순간 여기서 바로 빨개진다. 즉 "CI 만
     * 특정 시간대에 깨지는" 진단하기 어려운 실패가 "시간대 고정이 풀렸다"는 한 줄로 바뀐다.
     */
    @Test
    void 테스트_시계는_KST_다() {
        assertThat(TimeZone.getDefault().getID())
                .as("테스트 JVM 시간대가 KST 가 아니다 — build.gradle 의 user.timezone 고정을 확인할 것")
                .isEqualTo("Asia/Seoul");
        assertThat(LocalDate.now())
                .as("존 없는 LocalDate.now() 가 KstClock.today() 와 달라졌다")
                .isEqualTo(KstClock.today());
    }

    /**
     * 운영 코드는 존 없는 {@code LocalDate.now()} 를 쓰지 않는다 — {@link KstClock#today()} 를 쓴다.
     *
     * <p>{@code LocalDateTime.now()} 는 여기서 막지 않는다. 그쪽은 대부분 "기록된 시각"
     * (created_at·만료 시각 비교)이라 순간(instant)의 문제이고, 날짜 경계를 나누는 판정이
     * 아니다. 날짜 경계만이 KST 로 고정되어야 한다.
     */
    @Test
    void 운영_코드는_존_없는_LocalDate_now_를_쓰지_않는다() throws IOException {
        List<String> offenders = new ArrayList<>();
        try (Stream<Path> files = Files.walk(MAIN_SOURCES)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".java")).toList()) {
                List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
                for (int i = 0; i < lines.size(); i++) {
                    String line = lines.get(i);
                    if (!line.contains("LocalDate.now()") || isComment(line)) {
                        continue;
                    }
                    offenders.add("%s:%d".formatted(file, i + 1));
                }
            }
        }
        assertThat(offenders)
                .as("존 없는 LocalDate.now() 는 UTC 서버에서 한국 새벽에 '어제'를 준다 — KstClock.today() 를 쓸 것")
                .isEmpty();
    }

    /** 주석 줄 걸러내기 — KstClock·Quota 의 설명문이 자기 자신을 위반으로 잡는 것을 막는다 */
    private static boolean isComment(String line) {
        String trimmed = line.trim();
        return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*");
    }
}
