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
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.domain.CoupleEmojiSet;
import com.fitto.coupleemoji.repository.CoupleEmojiSetRepository;
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
import java.util.Map;
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
    /**
     * 한 세트에 들어가는 장 수 = 감정 종류 수. 숫자를 박아 두면 감정을 하나 늘릴 때마다
     * 이 테스트가 관계없이 깨진다(2026-09-10 상황 11종 추가 때 실제로 4건이 깨졌다).
     */
    private static final int ALL_EMOTIONS = CoupleEmojiEmotion.values().length;

    /** 한 요청 상한(12) 안쪽 — 기본 표정 한 벌. prepare 를 통과시키는 것이 목적이다. */
    private static final List<CoupleEmojiEmotion> WITHIN_LIMIT = List.of(
            CoupleEmojiEmotion.ANGRY, CoupleEmojiEmotion.HAPPY, CoupleEmojiEmotion.EXCITED,
            CoupleEmojiEmotion.SAD, CoupleEmojiEmotion.SLEEPY, CoupleEmojiEmotion.LOVE);

    private static final String SOURCE_URL =
            "https://res.cloudinary.com/demo/image/upload/v1712345678/fitto/emoji-source/abc123.jpg";

    @Autowired AuthService authService;
    @Autowired RelationService relationService;
    @Autowired CoupleEmojiService service;
    @Autowired ChatService chatService;
    @Autowired RelationRecordPurger purger;
    @Autowired CoupleEmojiSetRepository setRepository;
    @Autowired PlanGuard planGuard;
    @Autowired com.fitto.common.currency.CurrencyService currencyService;
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
        when(geminiClient.generateJsonInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList(), any(), any()))
                .thenReturn(objectMapper.readTree("""
                        {"gender":"Male","hairLength":"short above ears","hairStyle":"parted","hairColor":"dark brown",
                         "faceShape":"round","eyes":"almond","eyebrows":"thin","glasses":"no glasses",
                         "facialHair":"none","marks":"none","outfit":"white collared shirt"}
                        """));
        when(geminiClient.generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList()))
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

    /**
     * 전체 감정(23종)을 한 번에 그린다 — <b>요청 상한을 우회하는 게 아니라 그 아래를 보기 위해서다.</b>
     *
     * <p>한 요청 12장 상한({@code MAX_EMOTIONS_PER_REQUEST})은 요청 경계(prepare)의 정책이고,
     * 이 헬퍼를 쓰는 테스트들이 보는 건 그 아래 도메인 동작 — 트레이 공유, 무드 플래그, 부분
     * 실패, 배치 삭제 — 이라 전체 감정이 한 배치에 있어야 의미가 있다. 그래서 prepare 는 정상 요청
     * (검증·한도 차감)으로 통과시키고, 생성만 전체 감정으로 다시 묶어 부른다.
     * 상한 자체는 {@code 한_번에_열두_장까지만_받는다} 가 본다.
     */
    private CoupleEmojiBatchResponse generateFor(Long userId, Long subjectId) {
        CoupleEmojiService.GenerationTicket accepted =
                service.prepare(userId, new GenerateCoupleEmojiRequest(SOURCE_URL, subjectId, WITHIN_LIMIT));
        return service.generate(new CoupleEmojiService.GenerationTicket(
                accepted.relationId(), accepted.userId(), accepted.subjectUserId(),
                accepted.sourceImageUrl(), List.of(CoupleEmojiEmotion.values()), accepted.charge()));
    }

    /**
     * 감정 하나만 실패시키는 스텁 — <b>호출 순서가 아니라 인자로</b> 고른다.
     *
     * <p>세트는 여러 장을 동시에 그리므로(CoupleEmojiService.IMAGE_CONCURRENCY) thenReturn/thenThrow 를
     * 이어 붙이는 순서 기반 스텁은 <b>어느 감정이 실패할지 정할 수 없다</b> — 실제로 2026-09-10 병렬화 때
     * "HAPPY 가 실패해야 하는데 SAD 가 실패했다"로 깨졌다. 프롬프트에 감정별 문구가 들어가므로 그걸 본다.
     */
    private void failOnly(CoupleEmojiEmotion emotion, RuntimeException failure) {
        when(geminiClient.generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList())).thenAnswer(invocation -> {
            List<Map<String, Object>> parts = invocation.getArgument(2);
            boolean target = parts.stream()
                    .map(part -> String.valueOf(part.get("text")))
                    .anyMatch(text -> text.contains(emotion.expressionPrompt()));
            if (target) throw failure;
            return new GeneratedImage(new byte[] {1}, "image/png");
        });
    }

    @Test
    void 준비_단계에서_관계_대상_원본폴더를_검증하고_한도를_차감한다() {
        Long a = register("ce1@fitto.com");
        Long b = register("ce2@fitto.com");
        Long outsider = register("ce3@fitto.com");
        Long relationId = connectCouple(a, b);

        // 커플이 아니면 못 만든다
        assertThatThrownBy(() -> service.prepare(outsider, new GenerateCoupleEmojiRequest(SOURCE_URL, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.RELATION_NOT_FOUND);
        // 우리 둘이 아닌 사람 얼굴은 안 된다
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, outsider, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        // 전용 폴더가 아닌 URL 은 안 받는다 — 생성 뒤 원본을 지우므로 남의 사진 URL 을 넣는 경로를 막는다
        String foreignUrl = "https://res.cloudinary.com/demo/image/upload/v1/fitto/feed-photo.jpg";
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(foreignUrl, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PHOTO_URL);

        // 전용 폴더로 시작해도 상위 경로·쿼리가 섞이면 거절 — 접두사 검사를 우회하는 경로(점검 #17)
        String traversal = "https://res.cloudinary.com/demo/image/upload/v1/fitto/emoji-source/../feed-photo.jpg";
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(traversal, null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PHOTO_URL);
        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL + "?x=1", null, null)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_PHOTO_URL);

        // 거절된 두 건(관계 없음·대상 오류)은 이미 올라간 원본을 함께 지운다 — 남의 폴더 URL 은 건드리지 않는다
        verify(imageDeleter, times(2)).deleteAll(List.of(SOURCE_URL));
        verify(imageDeleter, never()).deleteAll(List.of(foreignUrl));
        verify(imageDeleter, never()).deleteAll(List.of(traversal));

        // 대상을 비우면 상대 얼굴이 기본
        CoupleEmojiService.GenerationTicket ticket =
                service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT));
        assertThat(ticket.relationId()).isEqualTo(relationId);
        assertThat(ticket.subjectUserId()).isEqualTo(b);
        // 한도 차감은 요청 스레드(prepare)에서 — 비싼 준비 전에 402 를 즉시 돌려주기 위해
        verify(geminiClient).requireImageConfiguredAndCharge(a, Feature.AI_COUPLE_EMOJI);
        // 접수가 됐으면 원본은 백그라운드 작업이 지운다 — 여기서는 안 지운다
        verify(imageDeleter, times(2)).deleteAll(List.of(SOURCE_URL));
    }

    /** 접수가 큐 포화로 거절되면 prepare 가 차감한 한도와 올라간 원본을 둘 다 되돌린다(점검 #9). */
    @Test
    void 접수가_거절되면_한도를_환불하고_원본을_지운다() {
        Long a = register("ce-abandon-a@fitto.com");
        Long b = register("ce-abandon-b@fitto.com");
        connectCouple(a, b);
        CoupleEmojiService.GenerationTicket ticket =
                service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT));

        service.abandon(ticket);

        verify(geminiClient).refund(eq(a), eq(Feature.AI_COUPLE_EMOJI), any());
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    @Test
    void 한도에_막히면_올라간_원본을_지운다() {
        Long a = register("ce-limit-a@fitto.com");
        Long b = register("ce-limit-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.PLAN_LIMIT_EXCEEDED))
                .when(geminiClient).requireImageConfiguredAndCharge(a, Feature.AI_COUPLE_EMOJI);
        // 첫 1회 무료도 이미 썼다 — 남은 길이 없을 때 거절이 원본을 치우는지 본다
        assertThat(planGuard.claimWelcome(a, b, Feature.AI_COUPLE_EMOJI)).isTrue();

        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_LIMIT_EXCEEDED);

        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    /**
     * 한 요청 12장 상한 — 23종을 한 번에 받지 않는다("한 세트 = 12장", docs/EMOJI_12_REGEN_2026-10-13.md).
     *
     * <p>거절은 <b>한도 차감 전</b>이어야 한다. 차감 뒤에 거절하면 사용자는 아무것도 못 받고
     * 세트만 잃는다. 올라간 원본도 같이 지운다(사진은 저장하지 않는다, §9).
     */
    @Test
    void 한_번에_열두_장까지만_받는다() {
        Long a = register("ce-cap-a@fitto.com");
        Long b = register("ce-cap-b@fitto.com");
        connectCouple(a, b);

        List<CoupleEmojiEmotion> thirteen = List.of(CoupleEmojiEmotion.values()).subList(0, 13);
        List<CoupleEmojiEmotion> twelve = List.of(CoupleEmojiEmotion.values()).subList(0, 12);

        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, thirteen)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThatThrownBy(() -> service.prepare(
                a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, List.of(CoupleEmojiEmotion.values()))))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);

        // 거절이 한도보다 먼저다 — 한 번도 차감하지 않았다
        verify(geminiClient, never()).requireImageConfiguredAndCharge(any(), any());
        // 두 번 거절했으니 올라간 원본도 두 번 지운다
        verify(imageDeleter, times(2)).deleteAll(List.of(SOURCE_URL));

        // 딱 12장(한 세트)은 통과한다
        assertThat(service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, twelve)).emotions())
                .hasSize(12);
    }

    /**
     * 개수는 중복을 걷어낸 뒤 센다 — 같은 감정을 여러 번 보낸 건 한 장이다.
     * 비어 있으면 거절한다(예전의 "비우면 전체 17종"은 상한을 우회하는 구멍이라 없앴다).
     */
    @Test
    void 감정은_중복을_걷어낸_뒤_세고_비면_거절한다() {
        Long a = register("ce-dup-a@fitto.com");
        Long b = register("ce-dup-b@fitto.com");
        connectCouple(a, b);

        List<CoupleEmojiEmotion> duplicated = List.of(
                CoupleEmojiEmotion.LOVE, CoupleEmojiEmotion.LOVE, CoupleEmojiEmotion.LOVE,
                CoupleEmojiEmotion.LOVE, CoupleEmojiEmotion.LOVE, CoupleEmojiEmotion.LOVE);
        assertThat(service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, duplicated)).emotions())
                .containsExactly(CoupleEmojiEmotion.LOVE);

        for (List<CoupleEmojiEmotion> empty : java.util.Arrays.asList(null, List.<CoupleEmojiEmotion>of())) {
            assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, empty)))
                    .isInstanceOf(BusinessException.class)
                    .extracting(e -> ((BusinessException) e).getErrorCode())
                    .isEqualTo(ErrorCode.INVALID_INPUT);
        }
    }

    @Test
    void 감정_6종을_만들어_저장하고_둘_다_같은_트레이를_본다() {
        Long a = register("ce4@fitto.com");
        Long b = register("ce5@fitto.com");
        connectCouple(a, b);

        CoupleEmojiBatchResponse batch = generateFor(a, b);

        assertThat(batch.emojis()).hasSize(ALL_EMOTIONS);
        assertThat(batch.failedEmotions()).isEmpty();
        assertThat(batch.emojis()).extracting(CoupleEmojiResponse::emotion)
                .containsExactly(CoupleEmojiEmotion.values());
        assertThat(batch.emojis()).extracting(CoupleEmojiResponse::label).contains("화남", "사랑");
        /*
         * 무드 피커가 "어느 기본 칸을 덮을지" 정하는 열쇠 — 앱이 같은 매핑표를 또 들지 않도록
         * 서버가 실어 보낸다. 비면 덮어쓰기가 통째로 조용히 멈춘다(MoodPicker.slots).
         */
        assertThat(batch.emojis()).allSatisfy(e -> assertThat(e.moodEmoji()).isNotBlank());
        assertThat(batch.emojis())
                .filteredOn(e -> e.emotion() == CoupleEmojiEmotion.ANGRY)
                .extracting(CoupleEmojiResponse::moodEmoji)
                .containsExactly(CoupleEmojiEmotion.ANGRY.moodEmoji());
        assertThat(batch.emojis()).allSatisfy(e -> {
            assertThat(e.batchId()).isEqualTo(batch.batchId());
            assertThat(e.subjectUserId()).isEqualTo(b);
            assertThat(e.createdBy()).isEqualTo(a);
            assertThat(e.imageUrl()).contains("/couple-emoji/");
            // 앱이 효과 레이어를 얹을지 이 값으로 가른다 — 비면 새 세트도 효과 없이 보인다
            assertThat(e.promptVersion()).matches("v\\d+");
        });

        // 커플 공용 — 만든 사람이 아닌 상대도 같은 목록을 본다
        assertThat(service.list(a)).hasSize(ALL_EMOTIONS);
        assertThat(service.list(b)).hasSize(ALL_EMOTIONS);

        // 2단계 생성의 흔적 — 텍스트 모델이 뽑은 사실이 행에 남는다
        String facts = (String) em.createNativeQuery(
                "select identity_facts from couple_emojis where batch_id = :b order by id limit 1")
                .setParameter("b", batch.batchId()).getSingleResult();
        assertThat(facts).contains("Male").contains("short above ears hair");
        // 살렸으므로 환불은 없다
        verify(geminiClient, never()).refund(any(), any(), any());
    }

    /**
     * 무드 노출 — 표정 6종만 켜진 채로 만들어지고, 상황 11종은 꺼진 채로 만들어진다.
     * 전부 올리면 무드 선택지가 기본 12 + 17 = 29개가 되기 때문이다(CoupleEmojiEmotion 주석).
     */
    @Test
    void 표정만_무드에_올라간_채로_만들어지고_토글로_바꿀_수_있다() {
        Long a = register("ce-mood-a@fitto.com");
        Long b = register("ce-mood-b@fitto.com");
        connectCouple(a, b);
        generateFor(a, null);

        var list = service.list(a);
        assertThat(list).filteredOn(CoupleEmojiResponse::moodVisible)
                .extracting(CoupleEmojiResponse::emotion)
                .containsExactlyInAnyOrder(CoupleEmojiEmotion.ANGRY, CoupleEmojiEmotion.HAPPY,
                        CoupleEmojiEmotion.EXCITED, CoupleEmojiEmotion.SAD, CoupleEmojiEmotion.SLEEPY,
                        CoupleEmojiEmotion.LOVE);

        // 상황 하나를 무드에 올린다 — 커플 공용이라 만든 사람이 아닌 상대(b)도 바꿀 수 있다
        Long kissId = list.stream().filter(e -> e.emotion() == CoupleEmojiEmotion.KISS)
                .findFirst().orElseThrow().id();
        assertThat(service.setMoodVisible(b, kissId, true).moodVisible()).isTrue();
        assertThat(service.list(a)).filteredOn(CoupleEmojiResponse::moodVisible).hasSize(7);

        // 다시 내린다
        assertThat(service.setMoodVisible(a, kissId, false).moodVisible()).isFalse();
        assertThat(service.list(a)).filteredOn(CoupleEmojiResponse::moodVisible).hasSize(6);
    }
    /**
     * 부분 재생성 — 감정을 지정하면 그것만 그린다. 마음에 드는 장을 두고 나머지만 다시 뽑는 경로라,
     * 장 수가 곧 실비다(감정 17종 기준 전체 재생성은 세트당 약 0.68 USD).
     */
    @Test
    void 감정을_지정하면_그것만_그리고_순서는_enum_순서를_따른다() {
        Long a = register("ce-partial-a@fitto.com");
        Long b = register("ce-partial-b@fitto.com");
        connectCouple(a, b);

        // 앱이 뒤죽박죽·중복으로 보내도 트레이 칸 순서(enum 순서)로 정리돼야 한다
        CoupleEmojiService.GenerationTicket ticket = service.prepare(a, new GenerateCoupleEmojiRequest(
                SOURCE_URL, null, List.of(CoupleEmojiEmotion.LOVE, CoupleEmojiEmotion.ANGRY, CoupleEmojiEmotion.LOVE)));
        CoupleEmojiBatchResponse batch = service.generate(ticket);

        assertThat(batch.emojis()).hasSize(2);
        assertThat(batch.emojis()).extracting(CoupleEmojiResponse::emotion)
                .containsExactly(CoupleEmojiEmotion.ANGRY, CoupleEmojiEmotion.LOVE);
        // 지정하지 않은 감정은 아예 호출되지 않는다 — 그게 곧 절약이다
        verify(geminiClient, times(2)).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());
    }

    @Test
    void 한_장이_거절돼도_나머지는_저장하고_환불하지_않는다() {
        Long a = register("ce6@fitto.com");
        Long b = register("ce7@fitto.com");
        connectCouple(a, b);
        // HAPPY 한 장만 안전필터 거절
        failOnly(CoupleEmojiEmotion.HAPPY, new BusinessException(ErrorCode.AI_IMAGE_REJECTED));

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.emojis()).hasSize(ALL_EMOTIONS - 1);
        assertThat(batch.failedEmotions()).containsExactly("HAPPY");
        assertThat(service.list(b)).hasSize(ALL_EMOTIONS - 1);
        verify(geminiClient, never()).refund(any(), any(), any());
    }

    @Test
    void 한_장도_못_살리면_환불하고_마지막_실패_사유로_던진다() {
        Long a = register("ce8@fitto.com");
        Long b = register("ce9@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .when(geminiClient).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());

        assertThatThrownBy(() -> generateFor(a, null))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.AI_IMAGE_REJECTED);

        assertThat(service.list(a)).isEmpty();
        verify(geminiClient).refund(eq(a), eq(Feature.AI_COUPLE_EMOJI), any());
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

        verify(geminiClient).refund(eq(a), eq(Feature.AI_COUPLE_EMOJI), any());
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
    }

    /** 업로드 뒤 DB 예외처럼 BusinessException 이 아닌 것이 새도 "이 장 실패"로 분류하고 세트는 이어진다. */
    @Test
    void 비즈니스_예외가_아닌_실패도_한_장_실패로_흡수한다() {
        Long a = register("ce-rt-a@fitto.com");
        Long b = register("ce-rt-b@fitto.com");
        connectCouple(a, b);
        failOnly(CoupleEmojiEmotion.ANGRY, new IllegalArgumentException("Illegal base64 character"));

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.emojis()).hasSize(ALL_EMOTIONS - 1);
        assertThat(batch.failedEmotions()).containsExactly("ANGRY");
        verify(geminiClient, never()).refund(any(), any(), any());
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
        assertThat(service.list(a)).extracting(CoupleEmojiResponse::id).doesNotContain(first).hasSize(ALL_EMOTIONS - 1);
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
        assertThat(remaining.longValue()).isEqualTo(ALL_EMOTIONS);

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
        // 세트 메타(V138)도 같이 — 남기면 relations FK 때문에 관계 삭제가 실패한다
        assertThat(setRepository.findById(batch.batchId())).isEmpty();
    }

    /** 세트 메타(V138) — 새 세트는 다시 그리기 3번을 갖고 태어난다(docs/EMOJI_12_REGEN_2026-10-13.md). */
    @Test
    void 새_세트는_다시_그리기_세_번을_갖고_만들어진다() {
        Long a = register("ce-set-a@fitto.com");
        Long b = register("ce-set-b@fitto.com");
        Long relationId = connectCouple(a, b);

        CoupleEmojiBatchResponse batch = generateFor(a, b);

        CoupleEmojiSet set = setRepository.findById(batch.batchId()).orElseThrow();
        assertThat(set.getRelationId()).isEqualTo(relationId);
        assertThat(set.getCreatedBy()).isEqualTo(a);
        assertThat(set.getRegenTotal()).isEqualTo(CoupleEmojiSet.REGEN_PER_SET);
        assertThat(set.getRegenUsed()).isZero();
    }

    /**
     * 실패한 장은 다시 그리기 횟수를 쓰지 않고 서버가 한 번 더 그린다(§8-D6). 원본이 아직 있는 동안이라 같은 사진으로.
     */
    @Test
    void 일시_실패한_장은_한_번_더_그려_채운다() {
        Long a = register("ce-retry-a@fitto.com");
        Long b = register("ce-retry-b@fitto.com");
        connectCouple(a, b);
        AtomicInteger sadCalls = new AtomicInteger();
        when(geminiClient.generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList())).thenAnswer(inv -> {
            List<Map<String, Object>> parts = inv.getArgument(2);
            boolean sad = parts.stream().map(p -> String.valueOf(p.get("text")))
                    .anyMatch(t -> t.contains(CoupleEmojiEmotion.SAD.expressionPrompt()));
            if (sad && sadCalls.incrementAndGet() == 1) throw new BusinessException(ErrorCode.AI_RATE_LIMITED);
            return new GeneratedImage(new byte[] {1}, "image/png");
        });

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.failedEmotions()).isEmpty();
        assertThat(batch.emojis()).hasSize(ALL_EMOTIONS);
        assertThat(sadCalls.get()).isEqualTo(2);
        // 채웠으니 보충할 것도 없다
        assertThat(setRepository.findById(batch.batchId()).orElseThrow().getRegenTotal())
                .isEqualTo(CoupleEmojiSet.REGEN_PER_SET);
    }

    /**
     * 한 번 더 그려도 못 살린 장은 그 수만큼 다시 그리기를 보충한다(§8-D5) — 회차는 환불하지 않지만 빈 칸을 채울 수 있다.
     * 안전 필터 거절은 같은 사진엔 같은 답이라 한 번 더 그리지 않는다(돈만 든다).
     */
    @Test
    void 끝내_못_살린_장만큼_다시_그리기를_보충하고_거절은_다시_그리지_않는다() {
        Long a = register("ce-topup-a@fitto.com");
        Long b = register("ce-topup-b@fitto.com");
        connectCouple(a, b);
        failOnly(CoupleEmojiEmotion.HAPPY, new BusinessException(ErrorCode.AI_IMAGE_REJECTED));

        CoupleEmojiBatchResponse batch = generateFor(a, null);

        assertThat(batch.failedEmotions()).containsExactly("HAPPY");
        // 거절은 한 번만 — 전체 감정 수만큼만 불렀다
        verify(geminiClient, times(ALL_EMOTIONS)).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());
        assertThat(setRepository.findById(batch.batchId()).orElseThrow().getRegenTotal())
                .isEqualTo(CoupleEmojiSet.REGEN_PER_SET + 1);
    }

    @Test
    void 한_장도_못_살리면_세트_메타도_남기지_않는다() {
        Long a = register("ce-noset-a@fitto.com");
        Long b = register("ce-noset-b@fitto.com");
        Long relationId = connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .when(geminiClient).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());

        assertThatThrownBy(() -> generateFor(a, null)).isInstanceOf(BusinessException.class);

        Number sets = (Number) em.createNativeQuery(
                "select count(*) from couple_emoji_sets where relation_id = :r").setParameter("r", relationId)
                .getSingleResult();
        assertThat(sets.longValue()).isZero();
    }

    // ---- 다시 그리기 (세트당 3번, docs/EMOJI_12_REGEN_2026-10-13.md) ----

    /** 세트 하나를 실제 생성 경로로 만든다 — 요청 상한 안쪽의 정상 세트(다시 그리기 3번). */
    private CoupleEmojiBatchResponse generateSet(Long userId) {
        return service.generate(service.prepare(userId, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT)));
    }

    private CoupleEmojiResponse regenerate(Long userId, String batchId, CoupleEmojiEmotion emotion) {
        return service.regenerate(service.prepareRegen(userId, batchId, emotion));
    }

    @Test
    void 다시_그리면_새_장이_옛_장을_대신하고_보낸_메시지는_옛_그림을_지킨다() {
        Long a = register("ce-regen-a@fitto.com");
        Long b = register("ce-regen-b@fitto.com");
        Long relationId = connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateSet(a);
        CoupleEmojiResponse happy = batch.emojis().stream()
                .filter(e -> e.emotion() == CoupleEmojiEmotion.HAPPY).findFirst().orElseThrow();
        chatService.send(b, relationId, new SendMessageRequest(
                MessageType.COUPLE_EMOJI, String.valueOf(happy.id()), null, null, null, null));

        // 상대(b)도 다시 그릴 수 있다 — 세트는 관계의 것
        CoupleEmojiResponse fresh = regenerate(b, batch.batchId(), CoupleEmojiEmotion.HAPPY);

        assertThat(fresh.id()).isNotEqualTo(happy.id());
        assertThat(fresh.batchId()).isEqualTo(batch.batchId());
        assertThat(fresh.imageUrl()).isNotEqualTo(happy.imageUrl());
        assertThat(fresh.regenRemaining()).isEqualTo(CoupleEmojiSet.REGEN_PER_SET - 1);
        // 트레이에는 새 장만 — 같은 감정이 둘 보이지 않는다
        assertThat(service.list(a)).filteredOn(e -> e.emotion() == CoupleEmojiEmotion.HAPPY)
                .extracting(CoupleEmojiResponse::id).containsExactly(fresh.id());
        assertThat(service.list(a))
                .allSatisfy(e -> assertThat(e.regenRemaining()).isEqualTo(CoupleEmojiSet.REGEN_PER_SET - 1));
        Number replaces = (Number) em.createNativeQuery("select replaces_id from couple_emojis where id = :id")
                .setParameter("id", fresh.id()).getSingleResult();
        assertThat(replaces.longValue()).isEqualTo(happy.id());
        // 이미 보낸 메시지는 옛 그림 그대로 — URL 을 복사해 들고 있고, 옛 파일은 지우지 않는다
        assertThat(chatService.getMessages(a, relationId, null).get(0).imageUrl()).isEqualTo(happy.imageUrl());
        verify(imageDeleter, never()).deleteAll(List.of(happy.imageUrl()));
        // 참조는 원본 사진(이미 지웠다)이 아니라 같은 세트의 다른 장 — 대신할 장(HAPPY)이 아닌 것
        List<String> others = batch.emojis().stream().filter(e -> !e.id().equals(happy.id()))
                .map(CoupleEmojiResponse::imageUrl).toList();
        verify(imageFetcher).fetch(org.mockito.ArgumentMatchers.argThat(others::contains));
        verify(imageFetcher, never()).fetch(happy.imageUrl());
    }

    @Test
    void 다시_그리기는_세트당_세_번이고_다_쓰면_그리지_않는다() {
        Long a = register("ce-regen3-a@fitto.com");
        Long b = register("ce-regen3-b@fitto.com");
        connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateSet(a);
        for (int i = 0; i < CoupleEmojiSet.REGEN_PER_SET; i++) {
            regenerate(a, batch.batchId(), CoupleEmojiEmotion.SAD);
        }

        assertThatThrownBy(() -> service.prepareRegen(a, batch.batchId(), CoupleEmojiEmotion.SAD))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_REGEN_EXHAUSTED);
        verify(geminiClient, times(WITHIN_LIMIT.size() + CoupleEmojiSet.REGEN_PER_SET))
                .generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());
        // 다시 그리기는 플랜 한도·크레딧을 건드리지 않는다 — 안전망만 센다
        verify(geminiClient, times(1)).requireImageConfiguredAndCharge(any(), any());
        verify(geminiClient, times(CoupleEmojiSet.REGEN_PER_SET)).requireImageConfiguredAndCountBackstop(a);
    }

    @Test
    void 다시_그리기가_실패하면_횟수를_돌려준다() {
        Long a = register("ce-regenfail-a@fitto.com");
        Long b = register("ce-regenfail-b@fitto.com");
        connectCouple(a, b);
        CoupleEmojiBatchResponse batch = generateSet(a);
        doThrow(new BusinessException(ErrorCode.AI_RATE_LIMITED))
                .when(geminiClient).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());

        CoupleEmojiService.RegenTicket ticket = service.prepareRegen(a, batch.batchId(), CoupleEmojiEmotion.LOVE);
        assertThat(setRepository.findById(batch.batchId()).orElseThrow().regenRemaining())
                .isEqualTo(CoupleEmojiSet.REGEN_PER_SET - 1);
        assertThatThrownBy(() -> service.regenerate(ticket)).isInstanceOf(BusinessException.class);

        assertThat(setRepository.findById(batch.batchId()).orElseThrow().regenRemaining())
                .isEqualTo(CoupleEmojiSet.REGEN_PER_SET);
        verify(geminiClient).refund(a, Feature.AI_COUPLE_EMOJI, PlanGuard.Charge.NONE);
        // 옛 장은 그대로 살아 있다
        assertThat(service.list(a)).extracting(CoupleEmojiResponse::emotion).contains(CoupleEmojiEmotion.LOVE);
    }

    /** 만들다 실패한 칸은 다시 그리기로 채운다 — 보충받은 횟수가 그 몫이다(§8-D5). */
    @Test
    void 빈_칸은_다시_그리기로_채운다() {
        Long a = register("ce-fill-a@fitto.com");
        Long b = register("ce-fill-b@fitto.com");
        connectCouple(a, b);
        failOnly(CoupleEmojiEmotion.SLEEPY, new BusinessException(ErrorCode.AI_IMAGE_REJECTED));
        CoupleEmojiBatchResponse batch = generateSet(a);
        assertThat(batch.failedEmotions()).containsExactly("SLEEPY");
        when(geminiClient.generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList()))
                .thenReturn(new GeneratedImage(new byte[] {7}, "image/png"));

        CoupleEmojiResponse filled = regenerate(a, batch.batchId(), CoupleEmojiEmotion.SLEEPY);

        assertThat(filled.emotion()).isEqualTo(CoupleEmojiEmotion.SLEEPY);
        assertThat(filled.batchId()).isEqualTo(batch.batchId());
        // 보충 1 + 기본 3 에서 하나 썼다
        assertThat(filled.regenRemaining()).isEqualTo(CoupleEmojiSet.REGEN_PER_SET);
        assertThat(service.list(a)).filteredOn(e -> e.batchId().equals(batch.batchId())).hasSize(WITHIN_LIMIT.size());
    }

    @Test
    void 다른_커플의_세트와_예전_세트는_다시_그릴_수_없다() {
        Long a = register("ce-regenx-a@fitto.com");
        Long b = register("ce-regenx-b@fitto.com");
        Long c = register("ce-regenx-c@fitto.com");
        Long d = register("ce-regenx-d@fitto.com");
        connectCouple(a, b);
        connectCouple(c, d);
        CoupleEmojiBatchResponse batch = generateSet(a);

        assertThatThrownBy(() -> service.prepareRegen(c, batch.batchId(), CoupleEmojiEmotion.HAPPY))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_NOT_FOUND);

        // V138 백필 세트(예전 6장 규칙)는 다시 그리기 0번
        new TransactionTemplate(transactionManager).executeWithoutResult(s -> em.createNativeQuery(
                "update couple_emoji_sets set charge_source = 'LEGACY', regen_total = 0 where batch_id = :b")
                .setParameter("b", batch.batchId()).executeUpdate());
        assertThatThrownBy(() -> service.prepareRegen(a, batch.batchId(), CoupleEmojiEmotion.HAPPY))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.COUPLE_EMOJI_REGEN_EXHAUSTED);
    }

    // ---- 커플당 첫 1회 무료 ----

    @Test
    void 막힌_커플은_첫_세트를_무료로_만들고_무료_세트에는_다시_그리기가_없다() {
        Long a = register("ce-welcome-a@fitto.com");
        Long b = register("ce-welcome-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));
        assertThat(service.welcomeAvailable(a)).isTrue();

        CoupleEmojiService.GenerationTicket ticket =
                service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT));
        assertThat(ticket.charge()).isEqualTo(PlanGuard.Charge.WELCOME);
        CoupleEmojiBatchResponse batch = service.generate(ticket);

        assertThat(setRepository.findById(batch.batchId()).orElseThrow().getRegenTotal()).isZero();
        // 커플당 한 번 — 나도, 상대도 다시 받지 못한다
        assertThat(service.welcomeAvailable(a)).isFalse();
        assertThat(service.welcomeAvailable(b)).isFalse();
        assertThatThrownBy(() -> service.prepare(b, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
    }

    @Test
    void 무료로_한_장도_못_만들면_무료_자격이_돌아온다() {
        Long a = register("ce-welcome2-a@fitto.com");
        Long b = register("ce-welcome2-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));
        // 목이 아니라 진짜 되돌림 경로를 태운다 — GeminiClient.refund → PlanGuard.refund(WELCOME)
        org.mockito.Mockito.doAnswer(inv -> {
            planGuard.refund(inv.getArgument(0), inv.getArgument(1), (PlanGuard.Charge) inv.getArgument(2));
            return null;
        }).when(geminiClient).refund(any(), any(), any(PlanGuard.Charge.class));
        doThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .when(geminiClient).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());

        assertThatThrownBy(() -> service.generate(
                service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT))))
                .isInstanceOf(BusinessException.class);

        assertThat(service.welcomeAvailable(a)).isTrue();
        assertThat(service.welcomeAvailable(b)).isTrue();
    }

    /** 무료는 결제로 풀리는 거절(402)에만 — PRO 남용 방지(429)는 무료로 풀지 않는다. */
    @Test
    void 남용_방지_한도는_무료로_풀지_않는다() {
        Long a = register("ce-welcome3-a@fitto.com");
        Long b = register("ce-welcome3-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.USAGE_LIMIT_EXCEEDED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));

        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT)))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.USAGE_LIMIT_EXCEEDED);
        assertThat(service.welcomeAvailable(a)).isTrue();
    }

    // ---- 유료 재화로 내기 (docs/CURRENCY_EMOJI_2026-10-13.md) ----

    /** 막힌 FREE 커플 — 플랜이 402 를 던지고, 첫 무료도 이미 썼다. 재화 39 를 충전해 둔다. */
    private void blockedWithoutWelcome(Long a, Long b) {
        doThrow(new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));
        assertThat(planGuard.claimWelcome(a, b, Feature.AI_COUPLE_EMOJI)).isTrue();
    }

    private GenerateCoupleEmojiRequest payRequest(String requestId) {
        return new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT, requestId, true);
    }

    @Test
    void 재화로_내면_39가_빠지고_다시_그리기_세_번인_세트가_된다() {
        Long a = register("ce-cur-a@fitto.com");
        Long b = register("ce-cur-b@fitto.com");
        connectCouple(a, b);
        blockedWithoutWelcome(a, b);
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-1", 39);

        CoupleEmojiService.GenerationTicket ticket = service.prepare(a, payRequest("req-cur-0001"));
        assertThat(ticket.charge()).isEqualTo(PlanGuard.Charge.CURRENCY);
        assertThat(currencyService.balance(a)).isZero();
        CoupleEmojiBatchResponse batch = service.generate(ticket);

        CoupleEmojiSet set = setRepository.findById(batch.batchId()).orElseThrow();
        assertThat(set.getChargeSource()).isEqualTo("CURRENCY");
        assertThat(set.getRegenTotal()).isEqualTo(CoupleEmojiSet.REGEN_PER_SET);
        assertThat(set.getPaidPrice()).isEqualTo(39L);
        // 상대(b)는 자기 돈을 안 냈지만 세트는 커플 것 — 같이 본다
        assertThat(service.list(b)).hasSize(WITHIN_LIMIT.size());
    }

    /** 재화는 앱이 "재화로 만들기"를 눌렀을 때만 — 잔액이 있어도 요청 없이는 빼지 않는다. */
    @Test
    void 재화로_내겠다고_하지_않으면_잔액이_있어도_402_다() {
        Long a = register("ce-cur2-a@fitto.com");
        Long b = register("ce-cur2-b@fitto.com");
        connectCouple(a, b);
        blockedWithoutWelcome(a, b);
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-2", 39);

        assertThatThrownBy(() -> service.prepare(a, new GenerateCoupleEmojiRequest(SOURCE_URL, null, WITHIN_LIMIT, "req-cur-0002")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.PLAN_UPGRADE_REQUIRED);
        assertThat(currencyService.balance(a)).isEqualTo(39);
    }

    @Test
    void 재화가_모자라면_402_이고_원본을_지운다() {
        Long a = register("ce-cur3-a@fitto.com");
        Long b = register("ce-cur3-b@fitto.com");
        connectCouple(a, b);
        blockedWithoutWelcome(a, b);
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-3", 20);

        assertThatThrownBy(() -> service.prepare(a, payRequest("req-cur-0003")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.CURRENCY_INSUFFICIENT);
        assertThat(currencyService.balance(a)).isEqualTo(20);
        verify(imageDeleter).deleteAll(List.of(SOURCE_URL));
        // 안전망 1회는 되돌렸다
        verify(geminiClient).refund(a, Feature.AI_COUPLE_EMOJI, PlanGuard.Charge.NONE);
    }

    @Test
    void 재화로_냈는데_한_장도_못_만들면_돌려준다() {
        Long a = register("ce-cur4-a@fitto.com");
        Long b = register("ce-cur4-b@fitto.com");
        connectCouple(a, b);
        blockedWithoutWelcome(a, b);
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-4", 39);
        doThrow(new BusinessException(ErrorCode.AI_IMAGE_REJECTED))
                .when(geminiClient).generateImageInBackground(any(), eq(Feature.AI_COUPLE_EMOJI), anyList());

        CoupleEmojiService.GenerationTicket ticket = service.prepare(a, payRequest("req-cur-0004"));
        assertThatThrownBy(() -> service.generate(ticket)).isInstanceOf(BusinessException.class);
        // 두 번 되돌려도 한 번만
        service.abandon(ticket);

        assertThat(currencyService.balance(a)).isEqualTo(39);
    }

    /** 요청 키 선점(15분)이 끝난 뒤 같은 요청이 다시 오면 — 한 번 내고 두 번 받지 않는다. */
    @Test
    void 이미_낸_요청_키로는_다시_만들지_않는다() {
        Long a = register("ce-cur5-a@fitto.com");
        Long b = register("ce-cur5-b@fitto.com");
        connectCouple(a, b);
        blockedWithoutWelcome(a, b);
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_99", "tx-ce-cur-5", 99);

        service.prepare(a, payRequest("req-cur-0005"));
        assertThatThrownBy(() -> service.prepare(a, payRequest("req-cur-0005")))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode())
                .isEqualTo(ErrorCode.INVALID_INPUT);
        assertThat(currencyService.balance(a)).isEqualTo(60);
    }

    /** PRO 가 이번 달 세트를 다 썼다(429) — 재화로 한 세트 더 살 수 있다. 첫 무료는 PRO 에게 안 쓴다. */
    @Test
    void PRO_월_한도를_다_써도_재화로는_만들_수_있다() {
        Long a = register("ce-cur7-a@fitto.com");
        Long b = register("ce-cur7-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.USAGE_LIMIT_EXCEEDED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-7", 39);

        assertThat(service.prepare(a, payRequest("req-cur-0007")).charge()).isEqualTo(PlanGuard.Charge.CURRENCY);
        assertThat(currencyService.balance(a)).isZero();
        assertThat(service.welcomeAvailable(a)).isTrue();
    }

    /** 첫 무료가 남았으면 재화보다 무료가 먼저다 — 무료가 있는데 돈을 빼면 사용자 손해다. */
    @Test
    void 첫_무료가_남았으면_재화로_내겠다고_해도_무료를_쓴다() {
        Long a = register("ce-cur6-a@fitto.com");
        Long b = register("ce-cur6-b@fitto.com");
        connectCouple(a, b);
        doThrow(new BusinessException(ErrorCode.PLAN_UPGRADE_REQUIRED))
                .when(geminiClient).requireImageConfiguredAndCharge(any(), eq(Feature.AI_COUPLE_EMOJI));
        currencyService.grantPurchase(a, com.fitto.common.plan.Store.GOOGLE_PLAY, "currency_39", "tx-ce-cur-6", 39);

        assertThat(service.prepare(a, payRequest("req-cur-0006")).charge()).isEqualTo(PlanGuard.Charge.WELCOME);
        assertThat(currencyService.balance(a)).isEqualTo(39);
    }
}
