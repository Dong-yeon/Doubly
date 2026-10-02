package com.fitto.common.upload;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * 원본 URL 판정 — 변형 URL 로 남의 원본을 지우는 경로(docs/daily-mood-current-state.md §8-6)를 막는다.
 * 스프링 컨텍스트 없이 돈다(컨텍스트 가짓수가 늘면 CI 힙이 모자란다 — CLAUDE.md 6절).
 */
class CloudinaryUrlsTest {

    private static final String BASE = "https://res.cloudinary.com/dubly/image/upload/";

    private static CloudinaryProperties props() {
        CloudinaryProperties p = new CloudinaryProperties();
        p.setCloudName("dubly");
        p.setApiKey("key");
        p.setApiSecret("secret");
        p.setFolder("fitto");
        return p;
    }

    @Test
    void 앱이_올린_원본은_기본_폴더_바로_아래로_인정한다() {
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1712345678/fitto/abc123.jpg", props(), "fitto")).isTrue();
        // 버전 세그먼트가 없는 secure_url 도 원본이다
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "fitto/abc123.jpg", props(), "fitto")).isTrue();
    }

    @Test
    void 변형_URL_은_원본으로_보지_않는다() {
        CloudinaryProperties p = props();
        // 다른 cloud 이름 — 삭제기는 public_id 만 뽑아 우리 클라우드에 destroy 를 보낸다
        assertThat(CloudinaryUrls.isImageDirectlyIn(
                "https://res.cloudinary.com/other/image/upload/v1/fitto/victim.jpg", p, "fitto")).isFalse();
        // 변환 세그먼트 — 같은 파일을 가리키지만 문자열이 달라 참조 확인을 피한다
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "w_100/v1/fitto/victim.jpg", p, "fitto")).isFalse();
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/w_100/fitto/victim.jpg", p, "fitto")).isFalse();
        // 상위 경로·쿼리·프래그먼트
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/fitto/../fitto/victim.jpg", p, "fitto")).isFalse();
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/fitto/victim.jpg?x=1", p, "fitto")).isFalse();
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/fitto/victim.jpg#a", p, "fitto")).isFalse();
        // http·다른 호스트
        assertThat(CloudinaryUrls.isImageDirectlyIn(
                "http://res.cloudinary.com/dubly/image/upload/v1/fitto/a.jpg", p, "fitto")).isFalse();
        assertThat(CloudinaryUrls.isImageDirectlyIn("https://img.example.com/fitto/a.jpg", p, "fitto")).isFalse();
        assertThat(CloudinaryUrls.isImageDirectlyIn(null, p, "fitto")).isFalse();
    }

    @Test
    void 일상_사진은_하위_폴더_파일을_받지_않는다() {
        // 하루 기록(journal/)·우리 이모지 원본 같은 다른 기능의 파일을 피드에 끌어오지 못한다
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/fitto/journal/a.jpg", props(), "fitto")).isFalse();
        // 폴더 이름이 접두사만 같은 경우
        assertThat(CloudinaryUrls.isImageDirectlyIn(BASE + "v1/fittox/a.jpg", props(), "fitto")).isFalse();
    }

    @Test
    void 삭제는_루트_폴더_아래_원본이면_깊이와_종류를_가리지_않는다() {
        CloudinaryProperties p = props();
        assertThat(CloudinaryUrls.isOwnOriginal(BASE + "v1/fitto/journal/a.jpg", p)).isTrue();
        assertThat(CloudinaryUrls.isOwnOriginal(
                "https://res.cloudinary.com/dubly/video/upload/v1/fitto/clip.m4a", p)).isTrue();
        assertThat(CloudinaryUrls.isOwnOriginal(BASE + "w_100/v1/fitto/a.jpg", p)).isFalse();
        assertThat(CloudinaryUrls.isOwnOriginal(BASE + "v1/other/a.jpg", p)).isFalse();
    }

    @Test
    void 삭제기는_변형_URL_을_지우지_않는다() {
        StoredMediaReferences references = mock(StoredMediaReferences.class);
        CloudinaryImageDeleter deleter = new CloudinaryImageDeleter(props(), references);

        // 원본이 아니면 Cloudinary 를 부르기 전에 거절한다(HTTP 호출 없이 false)
        assertThat(deleter.delete("https://res.cloudinary.com/other/image/upload/v1/fitto/victim.jpg")).isFalse();
        assertThat(deleter.delete(BASE + "w_100/v1/fitto/victim.jpg")).isFalse();
        verifyNoInteractions(references);
    }
}
