package com.fitto.chat;

import com.fitto.chat.domain.StickerImage;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 이미지 스티커 동기화 — 백엔드 {@link StickerImage} ↔ 프론트 {@code STICKER_IMAGES}.
 *
 * <p>두 파일의 주석이 서로 "여기 추가하면 거기도 추가할 것"이라고만 적어 두고 있었다.
 * 어긋나면 조용히 깨진다 — 프론트에만 있으면 앱은 보내지만 서버가 알림 미리보기에서
 * 코드를 못 읽고, 백엔드에만 있으면 트레이에 안 뜬다. 어느 쪽도 에러가 아니라서
 * 눈치채기까지 오래 걸린다({@code PlanFeatureSyncTest} 와 같은 이유·같은 패턴).
 *
 * <p>세 가지를 대조한다:
 * <ol>
 *   <li>코드 집합 — 한쪽에만 있는 스티커가 없어야 한다</li>
 *   <li>한국어 라벨 — 알림 미리보기는 백엔드 label, 트레이 툴팁은 프론트 label 을 쓴다.
 *       어긋나면 같은 스티커가 화면마다 다른 이름으로 보인다</li>
 *   <li>에셋 파일 존재 — {@code require()} 경로가 실제로 있어야 한다. tsc 는 이걸 잡지 못하고
 *       번들 시점에 터진다</li>
 * </ol>
 */
class StickerImageSyncTest {

    // 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 찾는다(PlanFeatureSyncTest 와 동일).
    private static final List<String> FRONTEND_SRC_CANDIDATES = List.of("../frontend/src", "frontend/src");

    /** {@code { code: 'X', label: 'Y', source: require('...') }} 한 줄에서 세 값을 뽑는다. */
    private static final Pattern ENTRY = Pattern.compile(
            "\\{\\s*code:\\s*'([A-Z0-9_]+)'\\s*,\\s*label:\\s*'([^']*)'\\s*,\\s*source:\\s*require\\('([^']+)'\\)");

    @Test
    void 프론트_STICKER_IMAGES_와_백엔드_StickerImage_가_일치한다() throws IOException {
        Map<String, String> frontend = parseFrontend();

        Map<String, String> backend = new LinkedHashMap<>();
        Arrays.stream(StickerImage.values()).forEach(s -> backend.put(s.name(), s.label()));

        assertThat(frontend.keySet())
                .as("프론트 stickerImages.ts 의 code 와 백엔드 StickerImage enum 불일치")
                .containsExactlyInAnyOrderElementsOf(backend.keySet());

        assertThat(frontend)
                .as("같은 스티커의 한국어 라벨이 프론트와 백엔드에서 다르다 (알림 미리보기 ≠ 트레이 툴팁)")
                .containsExactlyInAnyOrderEntriesOf(backend);
    }

    @Test
    void 스티커_에셋_파일이_모두_존재한다() throws IOException {
        Path frontendSrc = frontendSrc();
        String source = Files.readString(frontendSrc.resolve("constants/stickerImages.ts"), StandardCharsets.UTF_8);

        List<String> missing = new ArrayList<>();
        Matcher m = ENTRY.matcher(source);
        while (m.find()) {
            // require 경로는 constants/ 기준 상대경로다 (예: ../../assets/stickers/x.png)
            Path asset = frontendSrc.resolve("constants").resolve(m.group(3)).normalize();
            if (!Files.exists(asset)) {
                missing.add(m.group(1) + " -> " + m.group(3));
            }
        }

        assertThat(missing)
                .as("stickerImages.ts 의 require() 경로에 파일이 없다 — tsc 는 통과하지만 번들에서 터진다")
                .isEmpty();
    }

    private Map<String, String> parseFrontend() throws IOException {
        String source = Files.readString(
                frontendSrc().resolve("constants/stickerImages.ts"), StandardCharsets.UTF_8);

        Map<String, String> entries = new LinkedHashMap<>();
        Matcher m = ENTRY.matcher(source);
        while (m.find()) {
            entries.put(m.group(1), m.group(2));
        }
        assertThat(entries).as("stickerImages.ts 에서 STICKER_IMAGES 항목을 파싱하지 못함").isNotEmpty();
        return entries;
    }

    private Path frontendSrc() {
        for (String candidate : FRONTEND_SRC_CANDIDATES) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return p;
            }
        }
        throw new IllegalStateException("frontend/src 를 찾을 수 없습니다. 확인한 경로: " + FRONTEND_SRC_CANDIDATES
                + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }
}
