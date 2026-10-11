package com.fitto.sticker.dto;

import com.fitto.sticker.service.RemoteStickerCatalog;

import java.util.List;

/**
 * 서버 배포 스티커 카탈로그 — 앱 패널·말풍선이 번들에 없는 코드를 그림으로 바꾸는 표.
 *
 * <p>{@code url}·{@code thumbUrl} 은 <b>오리진 없는 경로</b>다({@code /sticker-assets/...}). 앱이 API
 * 주소의 오리진에 붙인다 — 로컬·운영 서버를 갈아끼워도 카탈로그가 따라온다.
 *
 * @param version 카탈로그 내용 해시. 앱은 같으면 저장해 둔 것을 그대로 쓴다
 */
public record StickerCatalogResponse(String version, List<Pack> packs) {

    public record Pack(String id, List<Item> items) {
    }

    public record Item(String code, String label, String url, String thumbUrl) {
    }

    public static StickerCatalogResponse from(RemoteStickerCatalog catalog) {
        return new StickerCatalogResponse(catalog.version(), catalog.packs().stream()
                .map(p -> new Pack(p.id(), p.items().stream()
                        .map(s -> new Item(s.code(), s.label(), s.url(), s.thumbUrl()))
                        .toList()))
                .toList());
    }
}
