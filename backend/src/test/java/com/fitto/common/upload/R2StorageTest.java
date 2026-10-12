package com.fitto.common.upload;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * R2 전환(2026-10-12) — 서명·주소 판정·버리기 규칙.
 */
class R2StorageTest {

    /**
     * AWS 문서 "Authenticating Requests: Using Query Parameters"(SigV4) 의 예제 그대로 — 계산이 한 글자라도 틀리면
     * R2 가 모든 업로드를 403 으로 거절한다. SDK 대신 직접 구현했으므로 공식 예제 값으로 고정한다.
     */
    @Test
    void SigV4_서명된_URL이_AWS_문서_예제와_같다() {
        String url = R2Signer.presign("GET", "https://examplebucket.s3.amazonaws.com/test.txt", Map.of(),
                "AKIAIOSFODNN7EXAMPLE", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", "us-east-1",
                Instant.parse("2013-05-24T00:00:00Z"), 86400);

        assertThat(url).isEqualTo("https://examplebucket.s3.amazonaws.com/test.txt"
                + "?X-Amz-Algorithm=AWS4-HMAC-SHA256"
                + "&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request"
                + "&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host"
                + "&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
    }

    private static R2Properties props() {
        R2Properties p = new R2Properties();
        p.setAccountId(" acct123 \n");
        p.setAccessKeyId("AKID\n");
        p.setSecretAccessKey("SECRET ");
        p.setBucket("dubly-media");
        p.setPublicBaseUrl("https://media.dubly.co.kr/");
        return p;
    }

    @Test
    void 업로드_주소는_이미지_형식을_서명에_묶고_공개_주소는_폴더_바로_아래다() {
        Instant now = Instant.parse("2026-10-12T07:00:00Z");
        R2Storage.UploadTarget t = new R2Storage(props()).presignUpload("fitto", "image/jpeg", now);

        assertThat(t.uploadUrl()).startsWith("https://acct123.r2.cloudflarestorage.com/dubly-media/fitto/"
                + now.getEpochSecond() + "-");
        assertThat(t.uploadUrl()).contains("X-Amz-SignedHeaders=content-type%3Bhost").contains("X-Amz-Expires=600");
        assertThat(t.publicUrl()).matches("https://media\\.dubly\\.co\\.kr/fitto/" + now.getEpochSecond() + "-[0-9a-f]{24}\\.jpg");
        assertThat(t.contentType()).isEqualTo("image/jpeg");
        // 앞뒤 공백이 붙은 변수(Railway 붙여넣기)도 깨끗이 쓴다
        assertThat(t.uploadUrl()).contains("X-Amz-Credential=AKID%2F20261012%2Fauto%2Fs3%2Faws4_request");
    }

    @Test
    void 이미지가_아닌_형식은_서명하지_않는다() {
        assertThat(R2Storage.isSupportedImageType("text/html")).isFalse();
        assertThat(R2Storage.isSupportedImageType("image/svg+xml")).as("SVG 는 스크립트를 품을 수 있다").isFalse();
        assertThatThrownBy(() -> new R2Storage(props()).presignUpload("fitto", "text/html", Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 앱이_올린_R2_주소만_우리_파일로_본다() {
        R2Properties p = props();
        String own = "https://media.dubly.co.kr/fitto/1791789857-0123456789abcdef01234567.jpg";

        assertThat(R2Urls.isImageDirectlyIn(own, p, "fitto")).isTrue();
        assertThat(R2Urls.isOwnOriginal(own, p, "fitto")).isTrue();
        assertThat(R2Urls.uploadedAt(own, p)).contains(Instant.ofEpochSecond(1791789857L));

        // 하위 폴더는 "바로 아래"가 아니다, 다른 호스트·변형 주소는 아예 우리 것이 아니다
        assertThat(R2Urls.isImageDirectlyIn("https://media.dubly.co.kr/fitto/journal/1791789857-0123456789abcdef.jpg", p, "fitto")).isFalse();
        assertThat(R2Urls.isOwnOriginal("https://evil.example.com/fitto/1791789857-0123456789abcdef.jpg", p, "fitto")).isFalse();
        assertThat(R2Urls.isOwnOriginal("https://media.dubly.co.kr/fitto/../other/a.jpg", p, "fitto")).isFalse();
        assertThat(R2Urls.isOwnOriginal("https://media.dubly.co.kr/fitto/a.jpg?x=1", p, "fitto")).isFalse();
        assertThat(R2Urls.isOwnOriginal("https://media.dubly.co.kr/other/a.jpg", p, "fitto")).isFalse();
        assertThat(R2Urls.isOwnOriginal("https://media.dubly.co.kr.evil.com/fitto/a.jpg", p, "fitto")).isFalse();
    }

    @Test
    void R2_사진도_막_올린_것만_버릴_수_있다() {
        CloudinaryProperties cloudinary = new CloudinaryProperties();
        cloudinary.setCloudName("demo");
        cloudinary.setApiKey("k");
        cloudinary.setApiSecret("s");
        Instant now = Instant.parse("2026-10-12T07:00:00Z");
        String fresh = "https://media.dubly.co.kr/fitto/" + now.minus(Duration.ofMinutes(5)).getEpochSecond()
                + "-0123456789abcdef01234567.jpg";
        String old = "https://media.dubly.co.kr/fitto/" + now.minus(Duration.ofHours(25)).getEpochSecond()
                + "-0123456789abcdef01234567.jpg";

        assertThat(UploadDiscardPolicy.isDiscardable(fresh, cloudinary, props(), now)).isTrue();
        assertThat(UploadDiscardPolicy.isDiscardable(old, cloudinary, props(), now)).isFalse();
        assertThat(UploadDiscardPolicy.isDiscardable(
                "https://media.dubly.co.kr/fitto/emoji-source/" + now.getEpochSecond() + "-0123456789abcdef.jpg",
                cloudinary, props(), now)).isFalse();
    }

    @Test
    void Cloudinary_응답은_옛_앱이_아는_모양_그대로다() {
        UploadSignatureResponse r = new UploadSignatureResponse("demo", "key", 1L, "fitto", "sig");
        assertThat(r.provider()).isEqualTo("cloudinary");
        assertThat(r.uploadUrl()).isNull();
    }
}
