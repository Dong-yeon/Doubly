package com.fitto.common.upload;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;

/**
 * S3 호환 <b>서명된 URL</b>(SigV4 쿼리 인증) — R2 업로드(PUT)와 삭제(DELETE)가 쓴다.
 *
 * <p>AWS SDK 를 쓰지 않은 이유: 이 서버는 힙을 256MB 로 묶어 돌린다(docs/railway-cost_2026-10-12.md).
 * SDK 는 클래스만으로 메타스페이스를 수십 MB 더 먹는데, 필요한 건 URL 서명 하나다. 알고리즘은 AWS 문서
 * "Authenticating Requests: Using Query Parameters" 그대로이고, 문서의 예제 값으로 테스트에서 고정한다.
 *
 * <p>서명에 묶은 헤더는 요청에서 <b>똑같이</b> 보내야 한다. 업로드는 content-type 을 묶어 이미지가 아닌 파일
 * (예: HTML)이 우리 도메인에서 서빙되는 것을 막는다.
 */
public final class R2Signer {

    private static final DateTimeFormatter AMZ_DATE =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
    private static final String ALGORITHM = "AWS4-HMAC-SHA256";
    private static final String UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

    private R2Signer() {
    }

    /**
     * @param url          서명할 주소(쿼리 없이). 경로는 이미 인코딩된 형태로 넘긴다({@link #encodePath})
     * @param extraHeaders host 외에 서명에 묶을 헤더(이름 → 값). 요청에서 같은 값을 보내야 한다
     * @param region       R2 는 "auto"
     */
    public static String presign(String method, String url, Map<String, String> extraHeaders,
                                 String accessKeyId, String secretAccessKey, String region,
                                 Instant now, long expiresSeconds) {
        URI uri = URI.create(url);
        String host = uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        String amzDate = AMZ_DATE.format(now);
        String date = amzDate.substring(0, 8);
        String scope = date + "/" + region + "/s3/aws4_request";

        TreeMap<String, String> headers = new TreeMap<>();
        headers.put("host", host);
        extraHeaders.forEach((k, v) -> headers.put(k.toLowerCase(), v.trim()));
        String signedHeaders = String.join(";", headers.keySet());

        TreeMap<String, String> query = new TreeMap<>();
        query.put("X-Amz-Algorithm", ALGORITHM);
        query.put("X-Amz-Credential", accessKeyId + "/" + scope);
        query.put("X-Amz-Date", amzDate);
        query.put("X-Amz-Expires", String.valueOf(expiresSeconds));
        query.put("X-Amz-SignedHeaders", signedHeaders);
        String canonicalQuery = canonicalQuery(query);

        StringBuilder canonicalHeaders = new StringBuilder();
        headers.forEach((k, v) -> canonicalHeaders.append(k).append(':').append(v).append('\n'));

        String canonicalRequest = method + "\n"
                + uri.getRawPath() + "\n"
                + canonicalQuery + "\n"
                + canonicalHeaders + "\n"
                + signedHeaders + "\n"
                + UNSIGNED_PAYLOAD;

        String stringToSign = ALGORITHM + "\n" + amzDate + "\n" + scope + "\n" + sha256Hex(canonicalRequest);

        byte[] key = hmac(("AWS4" + secretAccessKey).getBytes(StandardCharsets.UTF_8), date);
        key = hmac(key, region);
        key = hmac(key, "s3");
        key = hmac(key, "aws4_request");
        String signature = HexFormat.of().formatHex(hmac(key, stringToSign));

        return uri.getScheme() + "://" + host + uri.getRawPath() + "?" + canonicalQuery
                + "&X-Amz-Signature=" + signature;
    }

    /** 객체 키를 URL 경로로 — '/' 는 남기고 조각마다 인코딩 */
    public static String encodePath(String key) {
        StringBuilder sb = new StringBuilder();
        String[] parts = key.split("/", -1);
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) sb.append('/');
            sb.append(uriEncode(parts[i]));
        }
        return sb.toString();
    }

    private static String canonicalQuery(TreeMap<String, String> query) {
        StringBuilder sb = new StringBuilder();
        query.forEach((k, v) -> {
            if (sb.length() > 0) sb.append('&');
            sb.append(uriEncode(k)).append('=').append(uriEncode(v));
        });
        return sb.toString();
    }

    /** SigV4 URI 인코딩 — 비예약 문자(A-Z a-z 0-9 - _ . ~)만 그대로, 나머지는 %XX(대문자) */
    static String uriEncode(String value) {
        StringBuilder sb = new StringBuilder();
        for (byte b : value.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            boolean unreserved = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
                    || c == '-' || c == '_' || c == '.' || c == '~';
            if (unreserved) {
                sb.append((char) c);
            } else {
                sb.append('%').append(String.format("%02X", c));
            }
        }
        return sb.toString();
    }

    private static byte[] hmac(byte[] key, String data) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("HmacSHA256 사용 불가", e);
        }
    }

    private static String sha256Hex(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 사용 불가", e);
        }
    }
}
