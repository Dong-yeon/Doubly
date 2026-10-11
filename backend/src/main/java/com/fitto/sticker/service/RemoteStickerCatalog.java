package com.fitto.sticker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 서버에서 내려받는 스티커 카탈로그 — 앱 번들에 들어가지 않는 움직이는 이모티콘들(2026-10-01).
 *
 * <p><b>왜 서버 배포인가</b>: 번들에 넣으면 이모티콘을 늘릴수록 앱이 무거워진다(Noto 110종이 이미
 * 7.8MB). 카카오톡·비트윈처럼 팩은 서버에 두고, 앱은 패널을 열 때 썸네일만, 말풍선에 처음 그릴 때
 * 애니메이션을 받아 기기에 보관한다. 팩을 더하는 데 앱 배포가 필요 없다 — 파일 + 이 카탈로그 +
 * (새 팩이면) sticker_packs 시드 한 줄이 백엔드 배포로 나간다.
 *
 * <p><b>원본은 {@code classpath:stickers/catalog.json} 이다</b>({@code scripts/sticker-packs/add_pack.py}
 * 가 만든다). DB 가 아니라 파일인 이유: 그림 파일과 같은 커밋으로 움직여야 짝이 안 어긋난다. 팩의
 * 가격·잠금은 여전히 {@code sticker_packs} 가 답하고, 여기는 "어느 코드가 어느 팩의 무슨 그림인가"만 안다.
 *
 * <p>파일은 {@code /sticker-assets/<code>.<해시>.json} 으로 공개된다({@code StickerAssetConfig}).
 * 이름에 내용 해시가 있어 1년 immutable 캐시를 걸 수 있다 — 그림을 고치면 이름이 바뀐다.
 */
@Component
public class RemoteStickerCatalog {

    static final String CATALOG_PATH = "stickers/catalog.json";
    /** 앱이 API 주소의 오리진에 붙여 쓰는 경로 접두 — StickerAssetConfig 의 핸들러와 같아야 한다 */
    public static final String ASSET_URL_PREFIX = "/sticker-assets/";

    /** 카탈로그 한 항목. {@code file}·{@code thumb} 는 sticker-assets 안의 파일 이름이다 */
    public record RemoteSticker(String code, String label, String packId, String file, String thumb) {
        public String url() {
            return ASSET_URL_PREFIX + file;
        }

        public String thumbUrl() {
            return ASSET_URL_PREFIX + thumb;
        }
    }

    public record RemotePack(String id, List<RemoteSticker> items) {
    }

    private final List<RemotePack> packs;
    private final Map<String, RemoteSticker> byCode;
    /** 카탈로그 내용 해시 — 앱이 "바뀌었나"만 보고 다시 받을지 정한다 */
    private final String version;

    public RemoteStickerCatalog(ObjectMapper objectMapper) {
        ClassPathResource resource = new ClassPathResource(CATALOG_PATH);
        if (!resource.exists()) {
            // 카탈로그가 없어도 서버는 떠야 한다 — 번들 이모티콘은 이것과 무관하게 동작한다
            this.packs = List.of();
            this.byCode = Map.of();
            this.version = "empty";
            return;
        }
        try (InputStream in = resource.getInputStream()) {
            byte[] bytes = in.readAllBytes();
            JsonNode root = objectMapper.readTree(bytes);
            List<RemotePack> loaded = new ArrayList<>();
            Map<String, RemoteSticker> index = new LinkedHashMap<>();
            for (JsonNode p : root.path("packs")) {
                String packId = p.path("id").asText();
                List<RemoteSticker> items = new ArrayList<>();
                for (JsonNode i : p.path("items")) {
                    RemoteSticker s = new RemoteSticker(i.path("code").asText(), i.path("label").asText(), packId,
                            i.path("file").asText(), i.path("thumb").asText());
                    if (index.putIfAbsent(s.code(), s) != null) {
                        throw new IllegalStateException("카탈로그에 같은 코드가 둘이다: " + s.code());
                    }
                    items.add(s);
                }
                loaded.add(new RemotePack(packId, List.copyOf(items)));
            }
            this.packs = List.copyOf(loaded);
            this.byCode = Map.copyOf(index);
            this.version = sha256(bytes).substring(0, 12);
        } catch (IOException e) {
            throw new UncheckedIOException("스티커 카탈로그를 읽지 못했다: " + CATALOG_PATH, e);
        }
    }

    public List<RemotePack> packs() {
        return packs;
    }

    public String version() {
        return version;
    }

    public Optional<RemoteSticker> find(String code) {
        return code == null ? Optional.empty() : Optional.ofNullable(byCode.get(code));
    }

    private static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
