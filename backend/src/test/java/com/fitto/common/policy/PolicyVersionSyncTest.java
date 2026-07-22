package com.fitto.common.policy;

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
 * 약관 버전 동기화 (AUTH-09).
 *
 * <p>재동의 판별({@code User.hasAgreedTo})은 프론트가 표시·전송하는 버전과
 * 백엔드가 저장하는 버전이 <b>같다</b>는 전제 위에서 동작한다. 한쪽만 올리면
 * 판별이 조용히 어긋나므로, 프론트 legal.ts 의 버전 상수를 읽어 백엔드와 대조한다.
 */
class PolicyVersionSyncTest {

    // 테스트는 backend 모듈 디렉터리에서 실행된다 — 후보 경로로 legal.ts 를 찾는다.
    private static final List<String> LEGAL_TS_CANDIDATES = List.of(
            "../frontend/src/constants/legal.ts",
            "frontend/src/constants/legal.ts");

    @Test
    void 프론트와_백엔드_약관_버전이_일치한다() throws IOException {
        String legal = readLegalTs();

        assertThat(extract(legal, "TERMS_VERSION"))
                .as("이용약관 버전: 프론트 legal.ts 와 백엔드 PolicyVersion.TERMS 불일치")
                .isEqualTo(PolicyVersion.TERMS);
        assertThat(extract(legal, "PRIVACY_VERSION"))
                .as("개인정보처리방침 버전: 프론트 legal.ts 와 백엔드 PolicyVersion.PRIVACY 불일치")
                .isEqualTo(PolicyVersion.PRIVACY);
    }

    private String readLegalTs() throws IOException {
        for (String candidate : LEGAL_TS_CANDIDATES) {
            Path p = Path.of(candidate);
            if (Files.exists(p)) {
                return Files.readString(p, StandardCharsets.UTF_8);
            }
        }
        throw new IllegalStateException(
                "legal.ts 를 찾을 수 없습니다. 확인한 경로: " + LEGAL_TS_CANDIDATES
                        + " (실행 디렉터리: " + Path.of("").toAbsolutePath() + ")");
    }

    /** {@code export const NAME = '값';} 에서 값 추출. */
    private String extract(String source, String name) {
        Matcher m = Pattern.compile(name + "\\s*=\\s*'([^']+)'").matcher(source);
        assertThat(m.find())
                .as("legal.ts 에서 " + name + " 상수를 찾지 못함")
                .isTrue();
        return m.group(1);
    }
}
