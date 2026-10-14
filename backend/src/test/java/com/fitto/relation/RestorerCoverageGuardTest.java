package com.fitto.relation;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 지난 기록 불러오기(REL-07)는 옛 관계의 행을 새 관계로 옮긴 뒤 옛 관계를 지운다. relations 를 참조하는 테이블을
 * Restorer 가 모르면 그 삭제가 FK 위반으로 실패해 복원 전체가 500 이 된다 — 무드(2026-09-08)·이모지 세트(10-13)·
 * 게임 외 6종(10-14)으로 세 번 반복됐다. 마이그레이션을 훑어 relations 를 참조하는 테이블이 Restorer 소스에
 * 등장하는지 본다(옮기든 지우든 일부러 다뤘다는 표시).
 */
class RestorerCoverageGuardTest {

    private static final Path MIGRATIONS = Path.of("src/main/resources/db/migration");
    private static final Path RESTORER =
            Path.of("src/main/java/com/fitto/relation/service/RelationRecordRestorer.java");

    /** Restorer 가 다루지 않아도 되는 테이블 — 이유를 함께 적는다 */
    private static final Set<String> EXEMPT = Set.of(
            "trainer_routines",        // 트레이너 관계 전용 — 복원은 커플 관계끼리만
            "couple_characters",       // V56 에서 드롭
            "scheduled_chat_messages"  // ON DELETE CASCADE — 일부러 옮기지 않는다(Restorer 주석)
    );

    private static final Pattern CREATE = Pattern.compile("(?i)create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(\\w+)");
    private static final Pattern ALTER = Pattern.compile("(?i)alter\\s+table\\s+(\\w+)");
    private static final Pattern REF = Pattern.compile("(?i)references\\s+relations\\s*\\(");

    @Test
    void relations_를_참조하는_테이블은_모두_Restorer_가_다룬다() throws IOException {
        Set<String> referencing = new TreeSet<>();
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            for (Path file : files.filter(p -> p.toString().endsWith(".sql")).toList()) {
                String current = null;
                for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                    String code = line.replaceAll("--.*", "");
                    Matcher m = CREATE.matcher(code);
                    if (m.find()) current = m.group(1).toLowerCase();
                    m = ALTER.matcher(code);
                    if (m.find()) current = m.group(1).toLowerCase();
                    if (current != null && REF.matcher(code).find()) referencing.add(current);
                }
            }
        }
        String restorer = Files.readString(RESTORER, StandardCharsets.UTF_8);

        assertThat(referencing).as("마이그레이션 파싱 확인").contains("places", "couple_games");
        assertThat(referencing.stream()
                .filter(t -> !EXEMPT.contains(t))
                .filter(t -> !Pattern.compile("\\b" + t + "\\b").matcher(restorer).find())
                .toList())
                .as("relations 를 참조하는데 RelationRecordRestorer 가 다루지 않는 테이블 — 옮기거나 지우는 줄을 넣는다")
                .isEmpty();
    }
}
