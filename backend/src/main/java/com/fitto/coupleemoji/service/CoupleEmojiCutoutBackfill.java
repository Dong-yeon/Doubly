package com.fitto.coupleemoji.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.repository.ChatMessageRepository;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Optional;

/**
 * 이미 만든 우리 이모지의 배경 따내기 — 한 번에 조금씩. docs/COUPLE_EMOJI_CUTOUT_2026-09-30.md.
 *
 * <p>새로 만드는 이모지는 생성 때 따낸다({@link CoupleEmojiService}). 이건 그 전에 만든 것(bg_removed = null)을
 * 10분마다 20장씩 옮긴다 — 한꺼번에 돌리면 Cloudinary 호출이 몰리고 서버가 바빠진다.
 *
 * <p>한 장: 원본을 받아 따내기 → 따낸 PNG 를 {@code couple-emoji-cut} 에 올림 → (한 트랜잭션) 이모지 URL 교체 +
 * 그 URL 을 복사해 둔 지난 채팅 메시지 교체 → 커밋 뒤 원본 삭제. 따내기가 수상하면 원본을 그대로 두고 false 로 적어
 * 다시 시도하지 않는다. 받기 자체가 실패하면(네트워크) 아무것도 적지 않고 다음 차례에 다시 한다.
 */
@Component
public class CoupleEmojiCutoutBackfill {

    private static final Logger log = LoggerFactory.getLogger(CoupleEmojiCutoutBackfill.class);

    private final CoupleEmojiRepository emojis;
    private final ChatMessageRepository messages;
    private final CloudinaryImageFetcher fetcher;
    private final CloudinaryImageUploader uploader;
    private final CloudinaryImageDeleter deleter;
    private final TransactionTemplate tx;

    public CoupleEmojiCutoutBackfill(CoupleEmojiRepository emojis, ChatMessageRepository messages,
                                     CloudinaryImageFetcher fetcher, CloudinaryImageUploader uploader,
                                     CloudinaryImageDeleter deleter, TransactionTemplate tx) {
        this.emojis = emojis;
        this.messages = messages;
        this.fetcher = fetcher;
        this.uploader = uploader;
        this.deleter = deleter;
        this.tx = tx;
    }

    @Scheduled(initialDelay = 120_000, fixedDelay = 600_000)
    public void runScheduled() {
        int done = runOnce();
        if (done > 0) log.info("우리 이모지 배경 따내기 백필 {}장", done);
    }

    /** @return 처리한 장 수(따냄 + 원본 유지). 테스트는 스케줄러가 꺼져 있어 이걸 직접 부른다 */
    public int runOnce() {
        List<CoupleEmoji> batch = emojis.findTop20ByBgRemovedIsNullOrderByIdAsc();
        int done = 0;
        for (CoupleEmoji emoji : batch) {
            if (processOne(emoji.getId(), emoji.getImageUrl())) done++;
        }
        return done;
    }

    private boolean processOne(Long id, String originalUrl) {
        CloudinaryImageFetcher.Image source;
        try {
            source = fetcher.fetch(originalUrl);
        } catch (BusinessException e) {
            // 원본이 사라졌으면(404) 되살릴 길이 없다 — 원본 유지로 적고 넘어간다. 그 밖(네트워크)은 다음 차례에 다시
            if (e.getErrorCode() == com.fitto.common.exception.ErrorCode.PHOTO_DOWNLOAD_FAILED) {
                markKeep(id);
                return true;
            }
            log.warn("이모지 {} 원본 받기 실패 — 다음 차례에 다시: {}", id, e.getMessage());
            return false;
        }
        Optional<byte[]> cutout = EmojiCutout.cut(source.bytes());
        if (cutout.isEmpty()) {
            markKeep(id);
            return true;
        }
        String cutoutUrl;
        try {
            cutoutUrl = uploader.upload(cutout.get(), "image/png", CoupleEmojiService.CUTOUT_SUBFOLDER);
        } catch (BusinessException e) {
            log.warn("이모지 {} 따낸 이미지 올리기 실패 — 다음 차례에 다시: {}", id, e.getMessage());
            return false;
        }
        tx.executeWithoutResult(status -> {
            CoupleEmoji e = emojis.findById(id).orElse(null);
            if (e == null) return;
            e.replaceWithCutout(cutoutUrl);
            messages.replaceImageUrl(originalUrl, cutoutUrl, MessageType.COUPLE_EMOJI);
            // 원본은 더 이상 아무도 가리키지 않는다 — 커밋이 성공했을 때만 지운다
            deleter.deleteAllAfterCommit(List.of(originalUrl));
        });
        return true;
    }

    private void markKeep(Long id) {
        tx.executeWithoutResult(status -> emojis.findById(id).ifPresent(CoupleEmoji::keepOriginal));
    }
}
