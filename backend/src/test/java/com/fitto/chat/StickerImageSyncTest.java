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
 * <p><b>내린 코드도 그려지기는 해야 한다</b>(2026-09-21). 지난 말풍선의 content 에 그 코드가
 * 저장돼 있어서, 카탈로그에서 통째로 빼면 말풍선이 빈 칸이 되고 알림 미리보기가 코드를
 * 날것으로 노출한다. 그래서 프론트는 <b>두 목록</b>으로 나뉜다 —
 * {@code STICKER_CHARACTERS}(피커에 뜨는 것) 과 {@code RETIRED_STICKER_IMAGES}(그릴 줄만
 * 아는 것). 백엔드에서는 후자가 {@code packId == null} 이다({@link StickerImage#isRetired()}).
 *
 * <p>그래서 이 테스트는 <b>두 집합을 각각</b> 대조한다. 한 쪽만 보면 "피커에서 내렸는데
 * 말풍선도 같이 깨진" 상태를 놓친다 — 실제로 그렇게 한 번 깼다.
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
    void 피커에_뜨는_스티커가_프론트와_백엔드에서_같다() throws IOException {
        assertThat(parseSection(ACTIVE_SECTION, RETIRED_SECTION))
                .as("STICKER_CHARACTERS 와 백엔드 StickerImage(내리지 않은 것) 불일치")
                .containsExactlyInAnyOrderEntriesOf(backendBy(s -> !s.isRetired()));
    }

    /**
     * 내린 스티커는 <b>피커에는 없고 조회 목록에는 있어야</b> 한다.
     *
     * <p>이 둘을 한 배열이 겸하던 시절에는 "피커에서 내린다"가 곧 "지난 말풍선이 깨진다"였다.
     * 라벨만 사라지는 거라 tsc 도 못 잡고, 앱을 열어 옛 대화를 스크롤해야 보인다.
     */
    @Test
    void 내린_스티커는_피커에_없고_조회_목록에는_남는다() throws IOException {
        Map<String, String> retired = backendBy(StickerImage::isRetired);
        assertThat(retired)
                .as("내린 코드 목록이 비었다 — isRetired 가 무력화됐는지 확인할 것")
                .isNotEmpty();

        assertThat(parseSection(RETIRED_SECTION, null))
                .as("내린 스티커가 RETIRED_STICKER_IMAGES 에서 빠졌다 — 지난 말풍선이 빈 칸이 된다")
                .containsExactlyInAnyOrderEntriesOf(retired);

        assertThat(parseSection(ACTIVE_SECTION, RETIRED_SECTION).keySet())
                .as("내린 스티커가 피커에 다시 들어왔다")
                .doesNotContainAnyElementsOf(retired.keySet());
    }

    private Map<String, String> backendBy(java.util.function.Predicate<StickerImage> filter) {
        Map<String, String> map = new LinkedHashMap<>();
        Arrays.stream(StickerImage.values()).filter(filter).forEach(s -> map.put(s.name(), s.label()));
        return map;
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

    private static final String ACTIVE_SECTION = "export const STICKER_CHARACTERS";
    private static final String RETIRED_SECTION = "export const RETIRED_STICKER_IMAGES";

    /**
     * 파일의 한 구획만 파싱한다 — {@code from} 부터 {@code until} 직전까지.
     *
     * <p>구획 경계가 사라지면(이름을 바꾸거나 합치면) 여기서 바로 실패한다. 전체를
     * 훑으면 두 목록이 섞여 "피커에 있다"와 "그릴 줄 안다"를 구분할 수 없다.
     */
    private Map<String, String> parseSection(String from, String until) throws IOException {
        String source = Files.readString(
                frontendSrc().resolve("constants/stickerImages.ts"), StandardCharsets.UTF_8);

        int start = source.indexOf(from);
        assertThat(start).as("stickerImages.ts 에 %s 가 없다", from).isNotNegative();
        int end = until == null ? source.length() : source.indexOf(until, start);
        assertThat(end).as("stickerImages.ts 에 %s 가 없다", until).isNotNegative();

        Map<String, String> entries = new LinkedHashMap<>();
        Matcher m = ENTRY.matcher(source.substring(start, end));
        while (m.find()) {
            entries.put(m.group(1), m.group(2));
        }
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
