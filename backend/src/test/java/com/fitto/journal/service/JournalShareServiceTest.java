package com.fitto.journal.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.feed.dto.CreatePostRequest;
import com.fitto.feed.dto.FeedItemResponse;
import com.fitto.feed.dto.FeedItemType;
import com.fitto.feed.service.FeedService;
import com.fitto.journal.domain.JournalEntry;
import com.fitto.journal.repository.JournalEntryRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 공유의 사진 경로 — 서버가 새 파일로 복사하고, 실패하면 그 복사본을 지운다(§1-5).
 * 진짜 Cloudinary 를 부르지 않으려고 스프링 없이 가짜 부품으로 조립한다. 사진 없는 흐름은 JournalPrivacyTest.
 */
class JournalShareServiceTest {

    private static final long USER = 1L;
    private static final LocalDate DAY = LocalDate.of(2026, 10, 1);
    private static final String ORIGINAL = "https://res.cloudinary.com/dubly/image/upload/v1/fitto/journal/orig.jpg";
    private static final String COPY = "https://res.cloudinary.com/dubly/image/upload/v2/fitto/copy.jpg";

    private final JournalEntryRepository repository = mock(JournalEntryRepository.class);
    private final FeedService feedService = mock(FeedService.class);
    private final CloudinaryImageFetcher fetcher = mock(CloudinaryImageFetcher.class);
    private final CloudinaryImageUploader uploader = mock(CloudinaryImageUploader.class);
    private final CloudinaryImageDeleter deleter = mock(CloudinaryImageDeleter.class);
    private final PlatformTransactionManager txManager = mock(PlatformTransactionManager.class);

    private final JournalShareService service =
            new JournalShareService(repository, feedService, fetcher, uploader, deleter, txManager);

    private JournalEntry entryWithPhoto() {
        JournalEntry entry = JournalEntry.builder().userId(USER).journalDate(DAY)
                .moodEmoji("😊").body("그날").photoUrl(ORIGINAL).build();
        ReflectionTestUtils.setField(entry, "id", 10L);
        return entry;
    }

    private void givenPhotoCopies() {
        when(txManager.getTransaction(any())).thenReturn(mock(TransactionStatus.class));
        when(repository.findByUserIdAndJournalDate(USER, DAY)).thenReturn(Optional.of(entryWithPhoto()));
        when(fetcher.fetch(ORIGINAL)).thenReturn(new CloudinaryImageFetcher.Image(new byte[]{1, 2, 3}, "image/jpeg"));
        when(uploader.upload(any(), eq("image/jpeg"), eq(null))).thenReturn(COPY);
    }

    private static FeedItemResponse post(long id) {
        return new FeedItemResponse(FeedItemType.POST, id, USER, "나", true, null, "그날", COPY, null,
                List.of(), List.of(COPY), false, "그날");
    }

    @Test
    void 사진은_원본이_아니라_기본_폴더에_올린_복사본으로_싣는다() {
        givenPhotoCopies();
        when(feedService.createPost(eq(USER), any())).thenReturn(post(99L));
        when(repository.markShared(10L, USER, 99L)).thenReturn(1);

        service.share(USER, DAY, null);

        ArgumentCaptor<CreatePostRequest> sent = ArgumentCaptor.forClass(CreatePostRequest.class);
        verify(feedService).createPost(eq(USER), sent.capture());
        assertThat(sent.getValue().photosOrEmpty()).containsExactly(COPY).doesNotContain(ORIGINAL);
        assertThat(sent.getValue().recordDate()).isEqualTo(DAY);
        verify(uploader).upload(any(), eq("image/jpeg"), eq(null)); // null = 기본 폴더 바로 아래
        verify(deleter, never()).deleteAll(any());
    }

    @Test
    void 글을_만들다_실패하면_방금_올린_복사본을_지운다() {
        givenPhotoCopies();
        when(feedService.createPost(eq(USER), any()))
                .thenThrow(new BusinessException(ErrorCode.RELATION_NOT_FOUND));

        assertThatThrownBy(() -> service.share(USER, DAY, null)).isInstanceOf(BusinessException.class);
        verify(deleter).deleteAll(List.of(COPY));
    }

    @Test
    void 동시에_먼저_공유됐으면_되돌리고_복사본도_지운다() {
        givenPhotoCopies();
        when(feedService.createPost(eq(USER), any())).thenReturn(post(99L));
        when(repository.markShared(anyLong(), anyLong(), anyLong())).thenReturn(0);

        assertThatThrownBy(() -> service.share(USER, DAY, null))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.JOURNAL_ALREADY_SHARED);
        verify(txManager).rollback(any());
        verify(deleter).deleteAll(List.of(COPY));
    }
}
