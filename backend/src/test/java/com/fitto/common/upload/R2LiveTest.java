package com.fitto.common.upload;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 실제 R2 왕복 — 서명된 PUT → 공개 주소로 보기 → 삭제. <b>R2_LIVE=1 일 때만</b> 돈다(CI·평소 실행에선 건너뜀).
 *
 * <pre>R2_LIVE=1 R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_BUCKET=… ./gradlew test --tests "*R2LiveTest"</pre>
 * 버킷의 {@code _healthcheck/} 아래에 1x1 PNG 를 올렸다가 지운다.
 */
@EnabledIfEnvironmentVariable(named = "R2_LIVE", matches = "1")
class R2LiveTest {

    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    @Test
    void 서명된_주소로_올리고_공개_주소로_보이고_지워진다() throws Exception {
        R2Properties p = new R2Properties();
        p.setAccountId(System.getenv("R2_ACCOUNT_ID"));
        p.setAccessKeyId(System.getenv("R2_ACCESS_KEY_ID"));
        p.setSecretAccessKey(System.getenv("R2_SECRET_ACCESS_KEY"));
        p.setBucket(System.getenv("R2_BUCKET"));
        R2Storage storage = new R2Storage(p);
        HttpClient http = HttpClient.newHttpClient();

        R2Storage.UploadTarget t = storage.presignUpload("_healthcheck", "image/png", Instant.now());
        try {
            HttpResponse<String> put = http.send(HttpRequest.newBuilder(URI.create(t.uploadUrl()))
                    .header("Content-Type", "image/png").PUT(HttpRequest.BodyPublishers.ofByteArray(PNG)).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(put.statusCode()).as(put.body()).isEqualTo(200);

            // 같은 주소로 형식을 바꿔 올리면 서명이 맞지 않아 거절된다 — HTML 이 우리 도메인에 올라가지 못한다
            HttpResponse<String> html = http.send(HttpRequest.newBuilder(URI.create(t.uploadUrl()))
                    .header("Content-Type", "text/html").PUT(HttpRequest.BodyPublishers.ofString("<script>")).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(html.statusCode()).isEqualTo(403);

            HttpResponse<byte[]> get = http.send(HttpRequest.newBuilder(URI.create(t.publicUrl())).build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            assertThat(get.statusCode()).isEqualTo(200);
            assertThat(get.body()).isEqualTo(PNG);
            assertThat(get.headers().firstValue("content-type")).contains("image/png");
        } finally {
            assertThat(storage.delete(t.publicUrl())).isTrue();
        }
        HttpResponse<Void> gone = http.send(HttpRequest.newBuilder(URI.create(t.publicUrl() + "?v=" + System.nanoTime())).build(),
                HttpResponse.BodyHandlers.discarding());
        assertThat(gone.statusCode()).isEqualTo(404);
    }
}
