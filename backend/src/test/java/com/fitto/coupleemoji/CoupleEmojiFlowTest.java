package com.fitto.coupleemoji;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fitto.auth.dto.RegisterRequest;
import com.fitto.auth.service.AuthService;
import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.dto.SendMessageRequest;
import com.fitto.chat.service.ChatService;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.ai.GeneratedImage;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.plan.Feature;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.dto.CoupleEmojiBatchResponse;
import com.fitto.coupleemoji.dto.CoupleEmojiResponse;
import com.fitto.coupleemoji.dto.GenerateCoupleEmojiRequest;
import com.fitto.coupleemoji.service.CoupleEmojiService;
import com.fitto.relation.dto.InviteCodeResponse;
import com.fitto.relation.dto.RelationResponse;
import com.fitto.relation.service.RelationRecordPurger;
import com.fitto.relation.service.RelationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 우리 이모지 플로우 — H2 기반. Gemini·Cloudinary 는 목으로 대체한다(구글·Cloudinary 를 부르지 않는다).
 * 검증하는 것: 검증·한도 차감 시점, 장마다 저장, 부분 실패, 전부 실패 시 환불, 커플 공용 삭제, Purger.
 */
@SpringBootTest
@ActiveProfiles("test")
class CoupleEmojiFlowTest {

    /** 전용 폴더에 올라간 원본 URL 모양 — 이 폴더가 아니면 서버가 받지 않는다(서비스 주석). */
    private static final String SOURCE_URL =
            "https://res.cloudinary.com/demo/image/upload/v1712345678/fitto/emoji-source/abc123.jpg";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CoupleEmojiService service;
    @Autowired ChatService chatService;
    @Autowired RelationRecordPurger purger;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired ObjectMapper objectMapper;
    @PersistenceContext EntityManager em;

    @MockitoBean GeminiClient geminiClient;
    @MockitoBean CloudinaryImageFetcher imageFetcher;
    @MockitoBean CloudinaryImageUploader imageUploader;
    /** 스파이 — extractPublicId(폴더 게이트)는 진짜가 필요하고, deleteAll 호출 여부만 본다(미설정이라 no-op) */
    @MockitoSpyBean CloudinaryImageDeleter imageDeleter;

    private final AtomicInteger uploads = new AtomicInteger();

    @BeforeEach
    void stubHappyPath() throws Exception {
        uploads.set(0);
        when(imageFetcher.fetch(anyString()))
                .thenReturn(new CloudinaryImageFetcher.Image(new byte[] {1, 2, 3}, "image/jpeg"));
        when(geminiClient.generateJsonInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList(), any()))
                .thenReturn(objectMapper.readTree("""
                        {"gender":"Male","hairLength":"short above ears","hairStyle":"parted","hairColor":"dark brown",
                         "faceShape":"round","eyes":"almond","eyebrows":"thin","glasses":"no glasses",
                         "facialHair":"none","marks":"none","outfit":"white collared shirt"}
                        """));
        when(geminiClient.generateImageInBackground(anyList()))
                .thenReturn(new GeneratedImage(new byte[] {9, 9}, "image/jpeg"));
        when(imageUploader.upload(any(), anyString(), anyString()))
                .thenAnswer(inv -> "https://res.cloudinary.com/demo/image/upload/v1/fitto/couple-emoji/"
                        + uploads.incrementAndGet() + ".jpg");
    }

    private Long register(String email) {
        return authService.register(
                new RegisterRequest(email, "password123", email.substring(0, 2), null, null, true, true, false),
                "127.0.0.1").user().id();
    }

    private Long connectCouple(Long a, Long b) {
        InviteCodeResponse invite = relationService.createCoupleInvite(a);
        RelationResponse rel = relationService.connectCouple(b, invite.code());
        return rel.id();
    }

    private CoupleEmojiBatchResponse generateFor(Long userId, Long subjectId) {
        CoupleEmojiService.GenerationTicket ticket =
                service.prepare(userId, new GenerateCoupleEmojiRequest(SOURCE_URL, subjectId));
        return service.generate(ticket);
    }

    @Test
    void 준비_단계에서_관계_대상_원본폴더를_검증하고_한도를_차감한다() {
        Long a = register("ce1@fitto.com");
        Long b = register("ce2@fitto.com");
        Long outsider = register("ce3@fitto.com");
        Long relationId = connectCouple(a, b);

        // 커플이 아니면 못 만든다
        assertThatThrownBy(() -> service.prepare(outsider, new GenerateCoupleEmojiRequest(SOURCE_URL, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.RELATION_NOT_FOUND);
        // 우리 둘이 아닌 사람 얼굴은 안 된다
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, outsider)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        // 전용 폴더가 아닌 URL 은 안 받는다 — 생성 뒤 원본을 지우므로 남의 사진 URL 을 넣는 경로를 막는다
        String foreignUrl = "https://res.cloudinary.com/demo/image/upload/v1/fitto/feed-photo.jpg";
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(foreignUrl, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PHOTO_URL);

        // 거절된 두 건(관계 없음·대상 오류)은 이미 올라간 원본을 함께 지운다 — 남의 폴더 URL 은 건드리지 않는다
        verify(imageDeleter, times(2)).deleteAll(List.of(SOURCE_URL));
        verify(imageDeleter, never()).deleteAll(List.of(foreignUrl));

        // 대상을 비우면 상대 얼굴이 기본
        CoupleEmojiService.GenerationTicket ticket = service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null));
        assertThat(ticket.relationId()).isEqualTo(relationId);
        assertThat(ticket.subjectUserId()).isEqualTo(b);
        // 한도 차감은 요청 스레드(prepare)에서 — 비싼 준비 전에 402 를 즉시 돌려주기 위해
        verify(geminiClient).requireImageConfiguredAndCountUsage(a, Feature.AI_COUPLE_EMOJI);
        // 접수가 됐으면 원본은 백그라운드 작업이 지운다 — 여기서는 안 지운다
        verify(imageDeleter, times(2)).deleteAll(List.of(SOURCE_URL));
    }

    @Test
    void 한도에_막히면_올라간_원본을_지운다() {
        Long a = register("ce-limit-a@fitto.com");
        Long b = register("ce-limit-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED))
                .when(geminiClient).requireImageConfiguredAndCountUsage(a, Feature.AI_COUPLE_EMOJI);

        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);

        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    @Test
    void 감정_6종을_만들어_저장하고_둘_다_같은_트레이를_본다() {
        Long a = register("ce4@fitto.com");
        Long b = register("ce5@fitto.com");
        connectCouple(a, b);

        CoupleEmojiBatchResponse batch = generateFor(a, b);

        assertThat(batch.emojis()).hasSize(6);
        assertThat(batch.failedEmotions()).isEmpty();
        assertThat(batch.emojis()).extracting(CoupleEmojiResponse::emotion)
                .containsExactly(CoupleEmojiEmotion.values());
        assertThat(batch.emojis()).extracting(CoupleEmojiResponse::label).contains("화남", "사랑");
        assertThat(batch.emojis()).allSatisfy(e -> {
            assertThat(e.batchId()).isEqualTo(batch.batchId());
            assertThat(e.subjectUserId()).isEqualTo(b);
            assertThat(e.createdBy()).isEqualTo(a);
            assertThat(e.imageUrl()).contains("/couple-emoji/");
        });

        // 커플 공용 — 만든 사람이 아닌 상대도 같은 목록을 본다
        assertThat(service.list(a)).hasSize(6);
        assertThat(service.list(b)).hasSize(6);

        // 2단계 생성의 흔적 — 텍스트 모델이 뽑은 사실이 행에 남는다
        String facts = (String) em.createNativeQuery(
                "select identity_facts from couple_emojis where batch_id = :b order by id limit 1")
                .setParameter("b", batch.batchId()).getSingleResult();
        assertThat(facts).contains("Male").contains("short above ears hair");
        // 살렸으므로 환불은 없다
        verify(geminiClient, never()).refund(any(), any());
    }

    @Test
    void 한_장이_거절돼도_나머지는_저장하고_환불하지_않는다() {
        Long a = register("ce6@fitto.com");
        Long b = register("ce7@fitto.com");
        connectCouple(a, b);
        // 두 번째 장(HAPPY)만 안전필터 거절
        when(geminiClient.generateImageInBackground(anyList()))
                .thenReturn(new GeneratedImage(new byte[] {1}, "image/png"))
                .thenThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .thenReturn(new GeneratedImage(new byte[] {1}, "image/png"));

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.emojis()).hasSize(5);
        assertThat(batch.failedEmotions()).containsExactly("HAPPY");
        assertThat(service.list(b)).hasSize(5);
        verify(geminiClient, never()).refund(any(), any());
    }

    @Test
    void 한_장도_못_살리면_환불하고_마지막_실패_사유로_던진다() {
        Long a = register("ce8@fitto.com");
        Long b = register("ce9@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .when(geminiClient).generateImageInBackground(anyList());

        assertThatThrownBy(() -> generateFor(a, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_IMAGE_REJECTED);

        assertThat(service.list(a)).isEmpty();
        verify(geminiClient).refund(a, Feature.AI_COUPLE_EMOJI);
        // 실패해도 원본은 지운다(§9)
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    /** 다운로드가 거절돼도(파일은 있는 실패) 원본은 지워야 한다 — 예전엔 루프 뒤에서만 지워 남았다. */
    @Test
    void 원본_다운로드가_거절돼도_환불하고_원본을_지운다() {
        Long a = register("ce-fetch-a@fitto.com");
        Long b = register("ce-fetch-b@fitto.com");
        connectCouple(a, b);
        when(imageFetcher.fetch(anyString())).thenThrow(new BusinessException(ErrorCode.PHOTO_TOO_LARGE));

        assertThatThrownBy(() -> generateFor(a, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PHOTO_TOO_LARGE);

        verify(geminiClient).refund(a, Feature.AI_COUPLE_EMOJI);
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    /** 업로드 뒤 DB 예외처럼 BusinessException 이 아닌 것이 새도 "이 장 실패"로 분류하고 세트는 이어진다. */
    @Test
    void 비즈니스_예외가_아닌_실패도_한_장_실패로_흡수한다() {
        Long a = register("ce-rt-a@fitto.com");
        Long b = register("ce-rt-b@fitto.com");
        connectCouple(a, b);
        when(geminiClient.generateImageInBackground(anyList()))
                .thenThrow(new IllegalArgumentException("Illegal base64 character"))
                .thenReturn(new GeneratedImage(new byte[] {1}, "image/png"));

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.emojis()).hasSize(5);
        assertThat(batch.failedEmotions()).containsExactly("ANGRY");
        verify(geminiClient, never()).refund(any(), any());
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    @Test
    void 상대도_지울_수_있고_지운_것은_트레이에서만_사라진다() {
        Long a = register("ce10@fitto.com");
        Long b = register("ce11@fitto.com");
        Long outsider = register("ce12@fitto.com");
        connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateFor(a, b);
        Long first = batch.emojis().get(0).id();

        // 만든 사람이 아닌 상대(b)가 한 장 지운다 — 상대 얼굴을 쓰는 기능이라 상대의 삭제권이 곧 동의 장치
        service.delete(b, first);
        assertThat(service.list(a)).extracting(CoupleEmojiResponse::id).doesNotContain(first).hasSize(5);
        // 다시 지우면 없는 것
        assertThatThrownBy(() -> service.delete(a, first))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_NOT_FOUND);
        // 관계 밖 사람은 손댈 수 없다
        assertThatThrownBy(() -> service.delete(outsider, batch.emojis().get(1).id()))
                .isInstanceOf(BusinessException.class);

        // 숨김이지 삭제가 아니다 — 행과 URL 은 남는다(지난 메시지·Purger 가 쓴다)
        Number remaining = (Number) em.createNativeQuery(
                "select count(*) from couple_emojis where batch_id = :b").setParameter("b", batch.batchId())
                .getSingleResult();
        assertThat(remaining.longValue()).isEqualTo(6);

        // 세트 통째로
        service.deleteBatch(a, batch.batchId());
        assertThat(service.list(b)).isEmpty();
    }

    @Test
    void 채팅으로_보내면_URL_을_행에서_복사하고_숨긴_것은_보낼_수_없다() {
        Long a = register("ce15@fitto.com");
        Long b = register("ce16@fitto.com");
        Long relationId = connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateFor(a, b);
        CoupleEmojiResponse angry = batch.emojis().get(0);

        // 상대(b)도 보낼 수 있다 — 커플 공용이라 전송에는 PRO 판정이 없다. URL 은 클라 값이 아니라 행의 것
        ChatMessageResponse sent = chatService.send(b, relationId, new SendMessageRequest(
                MessageType.COUPLE_EMOJI, String.valueOf(angry.id()), "https://evil.example/x.png", null, null, null));
        assertThat(sent.messageType()).isEqualTo(MessageType.COUPLE_EMOJI);
        assertThat(sent.content()).isEqualTo(String.valueOf(angry.id()));
        assertThat(sent.imageUrl()).isEqualTo(angry.imageUrl());

        // 숨긴 뒤에는 새로 보낼 수 없지만, 이미 보낸 메시지는 URL 을 들고 있어 그대로 보인다
        service.delete(a, angry.id());
        assertThatThrownBy(() -> chatService.send(a, relationId, new SendMessageRequest(
                MessageType.COUPLE_EMOJI, String.valueOf(angry.id()), null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_NOT_FOUND);
        assertThat(chatService.getMessages(b, relationId, null).get(0).imageUrl()).isEqualTo(angry.imageUrl());

        // 다른 커플의 이모지 id·이상한 content 는 거절
        Long c = register("ce17@fitto.com");
        Long d = register("ce18@fitto.com");
        Long otherRelation = connectCouple(c, d);
        assertThatThrownBy(() -> chatService.send(c, otherRelation, new SendMessageRequest(
                MessageType.COUPLE_EMOJI, String.valueOf(batch.emojis().get(1).id()), null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_NOT_FOUND);
        assertThatThrownBy(() -> chatService.send(c, otherRelation, new SendMessageRequest(
                MessageType.COUPLE_EMOJI, "LOVE_BEAR", null, null, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
    }

    @Test
    void 관계를_지우면_숨긴_것까지_전부_지우고_이미지_URL_을_돌려준다() {
        Long a = register("ce13@fitto.com");
        Long b = register("ce14@fitto.com");
        Long relationId = connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateFor(a, b);
        service.delete(a, batch.emojis().get(0).id());
        List<String> emojiUrls = batch.emojis().stream().map(CoupleEmojiResponse::imageUrl).toList();

        List<String> urls = new TransactionTemplate(transactionManager).execute(s -> purger.purge(relationId));

        // 숨긴 한 장의 URL 도 포함 — 파일은 아직 있으므로 함께 지워야 한다
        assertThat(urls).containsAll(emojiUrls);
        Number remaining = (Number) em.createNativeQuery(
                "select count(*) from couple_emojis where relation_id = :r").setParameter("r", relationId)
                .getSingleResult();
        assertThat(remaining.longValue()).isZero();
    }
}
