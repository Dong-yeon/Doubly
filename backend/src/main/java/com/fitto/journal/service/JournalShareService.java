package com.fitto.journal.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.service.FeedService;
import com.fitto.journal.domain.JournalEntry;
import com.fitto.journal.dto.JournalEntryResponse;
import com.fitto.journal.dto.ShareJournalRequest;
import com.fitto.journal.repository.JournalEntryRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.List;

/**
 * 하루 기록 → "우리 기록에 공유"(1차-b, docs/PERSONAL_JOURNAL_ANALYSIS_2026-10-02.md §1-5·§4-3).
 *
 * <p><b>하루 기록이 상대에게 닿는 유일한 출구다.</b> {@link JournalService} 는 여전히 아무 데도 기록을 넘기지
 * 않고, 사용자가 직접 누른 이 한 경로만 피드 글을 만든다. 그래서 따로 둔다.
 *
 * <p><b>공유본은 독립된 복사본이다.</b>
 * <ul>
 *   <li>사진은 서버가 <b>새 파일로 복사</b>한다(§1-5 A안). 같은 URL 을 두 행이 들면 한쪽을 지울 때 다른 쪽
 *       파일까지 지워진다. 기본 폴더 바로 아래에 올려 일상 고치기의 사진 검증(CloudinaryUrls)도 지난다.
 *       복사는 1024px 로 줄여 받는다(CloudinaryImageFetcher) — 한 장짜리 일상 사진으로 충분하다.</li>
 *   <li>원본을 고쳐도 공유한 글은 그대로다. 공유한 글은 일상 고치기로 따로 고친다.</li>
 *   <li>기록일은 일기 날짜다(V119) — 오늘 공유해도 그날의 일상으로 묶인다.</li>
 *   <li>기분은 싣지 않는다 — 무드는 이미 상대에게 보이는 별도 채널(/mood)이다.</li>
 * </ul>
 * 글은 {@link FeedService#createPost} 로 만든다 — 상대 푸시(앞 40자)와 FEED 이벤트가 보통 일상과 똑같이 나간다.
 * 앱은 공유 확인 시트에서 이를 미리 알린다.
 *
 * <p>한 기록에 공유는 한 번(서버 측 사진 복사의 상한). 그 글이 지워지면 V121 의 SET NULL 로 다시 공유할 수 있다.
 */
@Service
public class JournalShareService {

    private final JournalEntryRepository repository;
    private final FeedService feedService;
    private final CloudinaryImageFetcher imageFetcher;
    private final CloudinaryImageUploader imageUploader;
    private final CloudinaryImageDeleter imageDeleter;
    private final TransactionTemplate tx;

    public JournalShareService(JournalEntryRepository repository, FeedService feedService,
                               CloudinaryImageFetcher imageFetcher, CloudinaryImageUploader imageUploader,
                               CloudinaryImageDeleter imageDeleter, PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.feedService = feedService;
        this.imageFetcher = imageFetcher;
        this.imageUploader = imageUploader;
        this.imageDeleter = imageDeleter;
        this.tx = new TransactionTemplate(transactionManager);
    }

    public JournalEntryResponse share(Long userId, LocalDate date, ShareJournalRequest request) {
        JournalEntry entry = find(userId, date);
        if (entry.getSharedPostId() != null) {
            throw new BusinessException(ErrorCode.JOURNAL_ALREADY_SHARED);
        }
        String content = request != null && request.content() != null && !request.content().isBlank()
                ? request.content()
                : entry.getBody();

        /*
         * 사진 복사는 트랜잭션 밖에서 한다 — 외부 호출 동안 DB 커넥션을 붙들지 않는다. 그 대신 뒤에서 실패하면
         * 방금 올린 복사본을 직접 지운다(아무 행도 가리키지 않는 파일이 남지 않게).
         */
        String copied = null;
        if (entry.getPhotoUrl() != null) {
            CloudinaryImageFetcher.Image image = imageFetcher.fetch(entry.getPhotoUrl());
            copied = imageUploader.upload(image.bytes(), image.mimeType(), null);
        }
        List<String> photos = copied != null ? List.of(copied) : List.of();

        try {
            tx.executeWithoutResult(status -> {
                FeedItemResponse post = feedService.createPost(userId,
                        new CreatePostRequest(content, null, photos, entry.getJournalDate()));
                if (repository.markShared(entry.getId(), userId, post.refId()) == 0) {
                    // 같은 기록의 공유가 동시에 먼저 끝났다 — 이 글은 되돌린다(푸시·이벤트는 커밋 뒤라 나가지 않는다)
                    throw new BusinessException(ErrorCode.JOURNAL_ALREADY_SHARED);
                }
            });
        } catch (RuntimeException e) {
            if (copied != null) {
                imageDeleter.deleteAll(List.of(copied));
            }
            throw e;
        }
        return JournalEntryResponse.from(find(userId, date));
    }

    private JournalEntry find(Long userId, LocalDate date) {
        return repository.findByUserIdAndJournalDate(userId, date)
                .orElseThrow(() -> new BusinessException(ErrorCode.JOURNAL_NOT_FOUND));
    }
}
