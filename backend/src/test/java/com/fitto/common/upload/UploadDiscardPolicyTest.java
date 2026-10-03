package com.fitto.common.upload;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * "올렸지만 안 쓴 사진 치우기"가 지워도 되는 URL — 앱 업로드 폴더 바로 아래의 원본, 최근 24시간 안에 올린 것만.
 * 스프링 없이 판정 함수만 본다(참조 확인은 삭제기가 따로 한다).
 */
class UploadDiscardPolicyTest {

    private static final Instant NOW = Instant.parse("2026-10-03T12:00:00Z");

    private static CloudinaryProperties props() {
        CloudinaryProperties p = new CloudinaryProperties();
        p.setCloudName("demo");
        p.setFolder("fitto");
        return p;
    }

    private static String url(Instant uploadedAt, String path) {
        return "https://res.cloudinary.com/demo/image/upload/v" + uploadedAt.getEpochSecond() + "/" + path;
    }

    @Test
    void 막_올린_앱_업로드_사진은_치울_수_있다() {
        assertThat(UploadDiscardPolicy.isDiscardable(url(NOW.minus(Duration.ofMinutes(3)), "fitto/abc123.jpg"), props(), NOW))
                .isTrue();
        assertThat(UploadDiscardPolicy.isDiscardable(url(NOW.minus(Duration.ofHours(24)), "fitto/abc123.jpg"), props(), NOW))
                .as("24시간 경계는 포함").isTrue();
    }

    @Test
    void 오래된_사진은_이_경로로_못_지운다() {
        assertThat(UploadDiscardPolicy.isDiscardable(url(NOW.minus(Duration.ofHours(25)), "fitto/abc123.jpg"), props(), NOW))
                .isFalse();
    }

    @Test
    void 서버가_관리하는_하위_폴더와_남의_클라우드와_변형_URL은_못_지운다() {
        Instant fresh = NOW.minus(Duration.ofMinutes(1));
        assertThat(UploadDiscardPolicy.isDiscardable(url(fresh, "fitto/journal/abc.jpg"), props(), NOW)).isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable(
                "https://res.cloudinary.com/other/image/upload/v" + fresh.getEpochSecond() + "/fitto/abc.jpg", props(), NOW))
                .isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable(
                "https://res.cloudinary.com/demo/image/upload/w_100/v" + fresh.getEpochSecond() + "/fitto/abc.jpg", props(), NOW))
                .isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable(
                "https://res.cloudinary.com/demo/video/upload/v" + fresh.getEpochSecond() + "/fitto/voice.m4a", props(), NOW))
                .as("오디오는 이 경로의 대상이 아니다").isFalse();
    }

    @Test
    void 버전이_없거나_URL이_아니면_못_지운다() {
        assertThat(UploadDiscardPolicy.isDiscardable("https://res.cloudinary.com/demo/image/upload/fitto/abc.jpg", props(), NOW))
                .isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable(null, props(), NOW)).isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable("not a url", props(), NOW)).isFalse();
    }

    @Test
    void 클라우드가_설정되지_않았으면_아무것도_못_지운다() {
        CloudinaryProperties unset = new CloudinaryProperties();
        assertThat(UploadDiscardPolicy.isDiscardable(url(NOW, "fitto/abc.jpg"), unset, NOW)).isFalse();
    }
}
