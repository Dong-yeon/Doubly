package com.fitto.sticker;

import com.fitto.chat.domain.AnimatedSticker;
import com.fitto.chat.domain.StickerImage;
import com.fitto.chat.domain.StickerPacks;
import com.fitto.chat.domain.TouchGesture;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 팩 카탈로그 3중 동기화 — enum ↔ Flyway 시드 ↔ 프론트 카탈로그.
 *
 * <p>같은 표가 세 곳에 있고 어긋나도 <b>컴파일이 되고 tsc 도 통과한다</b>. 어긋나면
 * 조용히 두 가지 중 하나가 된다: 유료 팩이 공짜로 새거나, <b>무료라고 보여 준 것을 서버가
 * 막거나</b>. 두 번째가 실제로 일어났고(docs/STICKER_PACK_OVERLAP_2026-09-14.md) STOMP 는
 * 402 를 화면으로 돌려줄 수 없어 말풍선이 "전송 중"에 멈췄다. 그 사고의 자리가 여기다.
 *
 * <p>특히 {@code 누가_무엇을_쓸_수_있는지는_그대로다} 가 이번 변경의 안전망이다 —
 * <b>무료로 준 것이 다시 잠기지 않는다</b>는 것을 값으로 고정한다.
 */
class StickerPackSyncTest {

    private static final List<String> FRONTEND_SRC_CANDIDATES = List.of("../frontend/src", "frontend/src");
    private static final List<String> MIGRATION_DIR_CANDIDATES = List.of(
            "src/main/resources/db/migration", "backend/src/main/resources/db/migration");

    /** {@code ('ANIM_LOVE', '두근두근', 'ANIMATED', TRUE,  1200)} 한 줄. */
    private static final Pattern SEED_ROW = Pattern.compile(
            "\\('([A-Z0-9_]+)',\\s*'[^']*',\\s*'([A-Z]+)',\\s*(TRUE|FALSE),\\s*(\\d+)\\)");

    /**
     * {@code DELETE FROM sticker_packs WHERE id IN ('A', 'B');} — 팩을 합칠 때 쓴다(V100).
     *
     * <p>INSERT 만 읽으면 <b>지워진 팩이 시드에 살아 있는 것으로 보인다</b>. 그러면 코드가
     * 없는 팩을 가리켜도 이 테스트가 통과해 버리고, 정작 서버는 팩을 못 찾아 조용히 무료로
     * 통과시킨다 — 이 테스트가 막으려던 바로 그 상태다.
     */
    private static final Pattern SEED_DELETE = Pattern.compile(
            "DELETE\\s+FROM\\s+sticker_packs\\s+WHERE\\s+id\\s+IN\\s*\\(([^)]*)\\)", Pattern.CASE_INSENSITIVE);

    /**
     * {@code UPDATE sticker_packs SET price = 0 WHERE id IN ('A', 'B');} — 값을 바꿀 때 쓴다(V105).
     *
     * <p>INSERT 만 읽으면 첫 시드의 값이 영원히 최종 상태로 보인다. 낱개 판매를 접은 뒤에도
     * "1200 원짜리 팩이 있다"고 읽히면, 이 파일의 가격 단언이 실제와 반대되는 것을 지킨다.
     */
    private static final Pattern SEED_PRICE_UPDATE = Pattern.compile(
            "UPDATE\\s+sticker_packs\\s+SET\\s+price\\s*=\\s*(\\d+)\\s+WHERE\\s+id\\s+IN\\s*\\(([^)]*)\\)",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern QUOTED_ID = Pattern.compile("'([A-Z0-9_]+)'");

    /** 마이그레이션 파일 이름의 버전 — 적용 순서를 파일 이름 순이 아니라 번호로 맞춘다. */
    private static final Pattern MIGRATION_VERSION = Pattern.compile("^V(\\d+)__");

    /** 프론트 {@code ANIM_HEART: PACK_ANIM_LOVE,} 한 줄 — 상수 이름에서 팩 id 를 되살린다. */
    private static final Pattern FRONT_ENTRY = Pattern.compile("\\s+(ANIM_[A-Z0-9_]+):\\s*PACK_([A-Z0-9_]+),");

    /** 시드 한 행 — 가격과 PRO 여부만 본다(제목은 바뀌어도 판정이 안 달라진다). */
    private record SeededPack(String category, boolean proOnly, int price) {
        boolean isFreeForEveryone() {
            return !proOnly && price == 0;
        }
    }

    @Test
    void enum_이_가리키는_팩은_전부_시드에_있다() throws IOException {
        Map<String, SeededPack> seeded = parseSeed();

        Set<String> referenced = new LinkedHashSet<>();
        for (AnimatedSticker s : AnimatedSticker.values()) {
            referenced.add(s.packId());
        }
        for (StickerImage s : StickerImage.values()) {
            if (!s.isRetired()) {
                referenced.add(s.packId());
            }
        }
        for (TouchGesture g : TouchGesture.values()) {
            referenced.add(StickerPacks.ofTouchGesture(g.name()));
        }
        referenced.add(StickerPacks.MOOD_PREMIUM);

        assertThat(seeded.keySet())
                .as("enum 이 가리키는 팩이 시드에 없다 — 서버가 팩을 못 찾으면 무료로 통과시킨다")
                .containsAll(referenced);
    }

    @Test
    void 내린_스티커는_팩이_없다() {
        // 팩이 없으면 판정을 지나지 않는다 — 지난 말풍선이 그대로 그려지는 근거다
        assertThat(StickerPacks.ofStickerContent("DUBI_LIKE")).isNull();
        assertThat(StickerPacks.ofStickerContent("BLI_LOVE")).isNull();
        // 유니코드 이모지·우리 이모지 id·모르는 코드도 같은 경로로 통과한다
        assertThat(StickerPacks.ofStickerContent("💕")).isNull();
        assertThat(StickerPacks.ofStickerContent("1234")).isNull();
        assertThat(StickerPacks.ofStickerContent(null)).isNull();
    }

    @Test
    void 기본_무드는_팩이_없고_확장_무드만_유료팩이다() throws IOException {
        // 무드는 원래 서버가 목록을 강제하지 않는다 — 기본 12종을 팩에 넣으면
        // 목록 밖 이모지를 쓰던 기존 동작이 갑자기 막힌다(MoodPack 주석)
        assertThat(StickerPacks.ofMoodEmoji("😊")).isNull();
        assertThat(StickerPacks.ofMoodEmoji("🦖")).isNull();
        assertThat(StickerPacks.ofMoodEmoji(null)).isNull();

        assertThat(StickerPacks.ofMoodEmoji("🤩")).isEqualTo(StickerPacks.MOOD_PREMIUM);
        assertThat(parseSeed().get(StickerPacks.MOOD_PREMIUM).isFreeForEveryone()).isFalse();
    }

    @Test
    void 프론트_stickerPacks_와_백엔드_enum_이_일치한다() throws IOException {
        Map<String, String> frontend = parseFrontendAnimated();
        assertThat(frontend)
                .as("stickerPacks.ts 파싱 실패 — ANIMATED_STICKER_PACKS 모양이 바뀌었는지 확인할 것")
                .isNotEmpty();

        Map<String, String> backend = new LinkedHashMap<>();
        for (AnimatedSticker s : AnimatedSticker.values()) {
            backend.put(s.name(), s.packId());
        }

        assertThat(frontend)
                .as("움직이는 이모티콘의 팩 배정이 프론트와 백엔드에서 다르다 — "
                        + "앱에는 열려 보이는데 서버가 막는(또는 그 반대의) 이모티콘이 생긴다")
                .containsExactlyInAnyOrderEntriesOf(backend);
    }

    @Test
    void 누가_무엇을_쓸_수_있는지는_그대로다() throws IOException {
        Map<String, SeededPack> seeded = parseSeed();

        /*
         * 이번 변경의 핵심 안전망. 움직이는 이모티콘은 <b>한 장도 빠짐없이 무료</b>여야 한다
         * (2026-09-21 결정 — 파는 것은 캐릭터 스티커와 우리 이모지뿐). 여기가 깨지면
         * 무료로 주던 것을 다시 잠근 것이고, 그건 새 상품이 아니라 기능 회수로 체감된다.
         */
        for (AnimatedSticker s : AnimatedSticker.values()) {
            SeededPack pack = seeded.get(s.packId());
            assertThat(pack).as("%s 의 팩 %s 가 시드에 없다", s.name(), s.packId()).isNotNull();
            assertThat(pack.isFreeForEveryone())
                    .as("%s 가 잠겼다 — 움직이는 이모티콘은 전부 무료다 (팩=%s)", s.name(), s.packId())
                    .isTrue();
        }

        /*
         * 이미지 스티커는 전부 무료였다(2026-09-14 결정). 지금은 그림 출처를 정리하느라
         * 한 장도 피커에 없지만, 되살릴 때 <b>잠긴 채로 돌아오면 안 된다</b> — 무료로
         * 보여 주던 것을 유료로 되살리는 건 신규 상품이 아니라 기능 회수다.
         */
        for (StickerImage s : StickerImage.values()) {
            if (s.isRetired()) {
                continue;
            }
            assertThat(seeded.get(s.packId()).isFreeForEveryone())
                    .as("%s 가 잠겼다 — 이미지 스티커는 번들 에셋이라 전부 무료였다", s.name())
                    .isTrue();
        }

        // 터치 제스처도 무료 3 / PRO 2 가 그대로다
        for (TouchGesture g : TouchGesture.values()) {
            assertThat(seeded.get(StickerPacks.ofTouchGesture(g.name())).isFreeForEveryone())
                    .as("%s 의 잠금 여부가 premium 플래그와 어긋난다", g.name())
                    .isEqualTo(!g.isPremium());
        }
    }

    /**
     * 낱개로 파는 팩은 없다 — <b>스티커는 구독으로만 판다</b>(2026-09-22, V105).
     *
     * <p>예전 단언은 정반대였다: "PRO 전용인데 가격이 없으면 하이브리드 모델의 절반이 빈다".
     * 그 모델을 접었다 — 팩 하나마다 스토어 상품을 등록하는 비용이 팩보다 비쌌고, 라인·카카오가
     * 자체 캐시로 우회하는 그 비용을 유료 팩 둘짜리 앱이 감당할 이유가 없었다.
     *
     * <p><b>이 테스트가 곧 의사결정 지점이다.</b> 낱개 판매를 다시 열려면 여기가 먼저 빨개지고,
     * 그때 확인할 것은 하나다 — 스토어 콘솔에 {@code sticker_pack_<id 소문자>} 상품이
     * <b>실제로 등록·활성화</b>돼 있는가. 값만 올리면 살 수 없는 가격표가 붙는다.
     */
    @Test
    void 낱개로_파는_팩은_없다() throws IOException {
        parseSeed().forEach((id, pack) -> assertThat(pack.price())
                .as("%s 에 낱개 가격이 붙었다 — 스토어 상품을 등록했다면 이 테스트를 고치고, "
                        + "아니라면 살 수 없는 가격표다", id)
                .isZero());
    }

    /**
     * 마이그레이션 <b>폴더 전체</b>에서 팩 행을 모은다 — 한 파일만 읽지 않는다.
     *
     * <p>팩은 여러 마이그레이션에 걸쳐 들어온다(V96 이 틀을 만들고 V97 이 캐릭터 팩을
     * 더했다). 파일명을 박아두면 새 팩을 더할 때마다 이 테스트가 "시드에 없다"고 거짓
     * 경보를 낸다 — 그러면 테스트를 고치는 게 습관이 되고, 진짜 누락도 같이 묻힌다.
     */
    private Map<String, SeededPack> parseSeed() throws IOException {
        Map<String, SeededPack> packs = new LinkedHashMap<>();
        try (var files = Files.list(firstExisting(MIGRATION_DIR_CANDIDATES))) {
            /*
             * <b>번호 순으로 읽는다 — 파일 이름 순이 아니다.</b> 사전순은 V100 을 V96 보다
             * 앞에 두므로('1' < '9'), 나중 마이그레이션의 DELETE·UPDATE 가 먼저 적용되고
             * 옛 INSERT 가 그 위를 덮는다. Flyway 가 실제로 적용하는 순서와 반대라, 파싱
             * 결과가 운영 DB 와 어긋난 채로 단언을 통과시킨다(V105 를 넣고 처음 드러났다).
             */
            for (Path f : files.sorted(Comparator.comparingInt(StickerPackSyncTest::versionOf)).toList()) {
                String sql = Files.readString(f, StandardCharsets.UTF_8);
                Matcher m = SEED_ROW.matcher(sql);
                while (m.find()) {
                    packs.put(m.group(1), new SeededPack(
                            m.group(2), "TRUE".equals(m.group(3)), Integer.parseInt(m.group(4))));
                }
                // 값이 바뀐 팩은 반영한다 — 안 하면 V96 의 옛 가격이 최종 상태로 보인다(V105)
                Matcher u = SEED_PRICE_UPDATE.matcher(sql);
                while (u.find()) {
                    int price = Integer.parseInt(u.group(1));
                    Matcher id = QUOTED_ID.matcher(u.group(2));
                    while (id.find()) {
                        packs.computeIfPresent(id.group(1),
                                (key, pack) -> new SeededPack(pack.category(), pack.proOnly(), price));
                    }
                }
                // 지워진 팩은 빼야 "시드에 있다"가 실제 DB 와 같은 뜻이 된다(SEED_DELETE 주석)
                Matcher d = SEED_DELETE.matcher(sql);
                while (d.find()) {
                    Matcher id = QUOTED_ID.matcher(d.group(1));
                    while (id.find()) {
                        packs.remove(id.group(1));
                    }
                }
            }
        }
        assertThat(packs).as("마이그레이션에서 팩 행을 하나도 파싱하지 못했다").isNotEmpty();
        return packs;
    }

    /** {@code V105__foo.sql} → 105. 번호가 없는 파일(있다면)은 맨 앞으로 보낸다. */
    private static int versionOf(Path file) {
        Matcher m = MIGRATION_VERSION.matcher(file.getFileName().toString());
        return m.find() ? Integer.parseInt(m.group(1)) : -1;
    }

    private Map<String, String> parseFrontendAnimated() throws IOException {
        String source = Files.readString(
                frontendSrc().resolve("constants/stickerPacks.ts"), StandardCharsets.UTF_8);
        // 상수 선언부(`export const PACK_X = 'X'`)가 아니라 매핑 표만 읽는다
        int start = source.indexOf("export const ANIMATED_STICKER_PACKS");
        assertThat(start).as("stickerPacks.ts 에 ANIMATED_STICKER_PACKS 가 없다").isNotNegative();
        String table = source.substring(start, source.indexOf("};", start));

        Map<String, String> entries = new LinkedHashMap<>();
        Matcher m = FRONT_ENTRY.matcher(table);
        while (m.find()) {
            entries.put(m.group(1), m.group(2));
        }
        return entries;
    }

    private Path frontendSrc() {
        return firstExisting(FRONTEND_SRC_CANDIDATES);
    }

    /** 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 찾는다(StickerImageSyncTest 와 동일). */
    private Path firstExisting(List<String> candidates) {
        for (String candidate : candidates) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return p;
            }
        }
        throw new IllegalStateException("경로를 찾을 수 없습니다: " + candidates
                + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }
}
