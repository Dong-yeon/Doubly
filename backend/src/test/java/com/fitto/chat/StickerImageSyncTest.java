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
 *
 * <p><b>내린 코드는 백엔드에만 남는다</b>(2026-09-21). 더비·블리를 피커에서 뺐지만 enum 에는
 * 남겼다 — 지난 말풍선의 content 에 그 코드가 저장돼 있어서 지우면 알림 미리보기가 라벨을
 * 못 찾는다. 그래서 이 테스트는 "양쪽이 같다"가 아니라 <b>"프론트 = 백엔드에서 내리지 않은
 * 것"</b>을 본다({@link StickerImage#isRetired()}). 내린 코드가 프론트에 다시 나타나는 것도
 * 함께 막는다 — 그림이 없는 코드를 트레이에 띄우면 빈 칸이 된다.
 */
class StickerImageSyncTest {

    // 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 찾는다(PlanFeatureSyncTest 와 동일).
    private static final List<String> FRONTEND_SRC_CANDIDATES = List.of("../frontend/src", "frontend/src");

    /**
     * {@code { code: 'X', label: 'Y', source: require('...') }} 한 줄에서 code·label·경로를 뽑는다.
     *
     * <p>label 과 source 사이에 다른 필드가 끼어도 건너뛴다. 카탈로그가 캐릭터별로 묶이거나
     * 항목에 필드가 붙는 일이 실제로 있었고, 그때 이 정규식은 한 건도 못 찾는다.
     * 그런데 이 테스트는 <b>0건이면 통과</b>한다(빈 집합끼리 비교) — 조용히 무력화되는 모양이라
     * 아래 파싱 결과 검사를 함께 세웠다.
     */
    private static final Pattern ENTRY = Pattern.compile(
            "\\{\\s*code:\\s*'([A-Z0-9_]+)'\\s*,\\s*label:\\s*'([^']*)'\\s*,(?:[^{}]*?,)?\\s*source:\\s*require\\('([^']+)'\\)");

    @Test
    void 프론트_STICKER_IMAGES_와_백엔드_StickerImage_가_일치한다() throws IOException {
        Map<String, String> frontend = parseFrontend();

        // 정규식이 한 건도 못 찾으면 빈 집합끼리 비교해 통과한다 — 파싱 자체가 살아 있는지 먼저 본다
        assertThat(frontend)
                .as("stickerImages.ts 파싱 실패 — ENTRY 정규식이 카탈로그 모양과 안 맞는다")
                .isNotEmpty();

        Map<String, String> active = new LinkedHashMap<>();
        Arrays.stream(StickerImage.values())
                .filter(s -> !s.isRetired())
                .forEach(s -> active.put(s.name(), s.label()));

        assertThat(frontend.keySet())
                .as("프론트 stickerImages.ts 의 code 와 백엔드 StickerImage enum(내리지 않은 것) 불일치")
                .containsExactlyInAnyOrderElementsOf(active.keySet());

        assertThat(frontend)
                .as("같은 스티커의 한국어 라벨이 프론트와 백엔드에서 다르다 (알림 미리보기 ≠ 트레이 툴팁)")
                .containsExactlyInAnyOrderEntriesOf(active);
    }

    @Test
    void 내린_스티커는_프론트_카탈로그에_없다() throws IOException {
        // 그림을 지운 코드가 트레이에 되살아나면 빈 칸이 된다 — 라벨만 남아 있어서 tsc 는 못 잡는다
        List<String> retired = Arrays.stream(StickerImage.values())
                .filter(StickerImage::isRetired)
                .map(StickerImage::name)
                .toList();
        assertThat(retired)
                .as("내린 코드 목록이 비었다 — isRetired 가 무력화됐는지 확인할 것")
                .isNotEmpty();

        assertThat(parseFrontend().keySet())
                .as("피커에서 내린 스티커가 프론트 카탈로그에 다시 들어왔다 (그림이 없어 빈 칸이 된다)")
                .doesNotContainAnyElementsOf(retired);
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
