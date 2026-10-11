package com.fitto.chat;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 캐치마인드 그림 공유 초대말이 서버와 앱에서 같은지 — {@link StickerImageSyncTest} 와 같은 이유.
 *
 * <p>그림 공유는 새 {@code MessageType} 없이 {@code IMAGE} 로 나가므로(구버전 앱 호환),
 * 앱이 "이 사진이 캐치마인드인가"를 알아보는 단서가 <b>본문 문구뿐</b>이다. 두 문자열이 어긋나면
 * 카드가 조용히 그냥 사진이 된다 — 눌러도 게임으로 가지 않고, <b>경고가 없다</b>. 그 침묵을
 * 이 테스트가 메운다.
 */
class CatchMindShareCaptionSyncTest {

    private static final List<String> SRC_CANDIDATES = List.of("../frontend/src", "frontend/src");
    private static final List<String> BACKEND_CANDIDATES =
            List.of("src/main/java", "backend/src/main/java");

    /** {@code export const CATCH_MIND_SHARE_CAPTION = '…';} */
    private static final Pattern FRONT = Pattern.compile(
            "export const CATCH_MIND_SHARE_CAPTION\\s*=\\s*'([^']*)'");
    /** {@code private static final String SHARE_CAPTION = "…";} */
    private static final Pattern BACK = Pattern.compile(
            "String SHARE_CAPTION\\s*=\\s*\"([^\"]*)\"");

    @Test
    void 서버와_앱의_초대말이_같다() throws IOException {
        String backend = extract(
                BACK,
                read(BACKEND_CANDIDATES, "com/fitto/game/service/CatchMindService.java"),
                "CatchMindService.SHARE_CAPTION");
        String frontend = extract(
                FRONT,
                read(SRC_CANDIDATES, "utils/catchMindShare.ts"),
                "catchMindShare.CATCH_MIND_SHARE_CAPTION");

        assertThat(frontend)
                .as("문구가 어긋나면 채팅의 캐치마인드 카드가 조용히 그냥 사진이 된다 "
                        + "— 양쪽을 같이 고칠 것")
                .isEqualTo(backend);
    }

    private static String extract(Pattern pattern, String source, String what) {
        Matcher m = pattern.matcher(source);
        assertThat(m.find()).as(what + " 을 찾지 못함 — 선언 모양이 바뀌었는지 확인").isTrue();
        return m.group(1);
    }

    private static String read(List<String> roots, String relative) throws IOException {
        for (String root : roots) {
            Path p = Path.of(root).resolve(relative);
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException(relative + " 를 찾을 수 없습니다. 확인한 경로: " + roots
                + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }
}
