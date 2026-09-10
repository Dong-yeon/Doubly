package com.fitto.coupleemoji.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fitto.common.ai.GeminiClient;
import com.fitto.common.ai.GeneratedImage;
import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.common.plan.Feature;
import com.fitto.common.plan.PlanGuard;
import com.fitto.common.upload.CloudinaryImageDeleter;
import com.fitto.common.upload.CloudinaryImageFetcher;
import com.fitto.common.upload.CloudinaryImageUploader;
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinarySigner;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.coupleemoji.domain.CoupleEmoji;
import com.fitto.coupleemoji.domain.CoupleEmojiEmotion;
import com.fitto.coupleemoji.dto.CoupleEmojiBatchResponse;
import com.fitto.coupleemoji.dto.CoupleEmojiResponse;
import com.fitto.coupleemoji.dto.GenerateCoupleEmojiRequest;
import com.fitto.coupleemoji.repository.CoupleEmojiRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.domain.RelationStatus;
import com.fitto.relation.domain.RelationType;
import com.fitto.relation.repository.RelationRepository;
import com.fitto.user.domain.User;
import com.fitto.user.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

/**
 * 우리 이모지 — 상대(또는 내) 사진 한 장으로 감정 6종 캐릭터 세트를 AI 가 그리고, 커플이 함께 쓴다.
 * 설계와 실측은 docs/COUPLE_EMOJI_AI_DESIGN_2026-09-08.md.
 *
 * <p><b>흐름은 두 스레드에 걸쳐 있다.</b> 요청 스레드에서 {@link #prepare} 가 검증·한도 차감을 끝내고
 * 티켓을 돌려주면, 컨트롤러가 그 티켓으로 {@code AiJobService} 에 {@link #generate} 를 넘긴다.
 * 차감을 요청 시점에 하는 이유는 비싼 준비(원본 다운로드·텍스트 모델 호출)를 시작하기 전에
 * 막아야 해서다 — 그리고 402 를 폴링 한 바퀴 뒤가 아니라 즉시 돌려주기 위해서다.
 *
 * <p><b>감정 한 장마다 트랜잭션을 따로 연다.</b> 6장이 순차로 약 1분 걸리는데(장당 8~15초), 한 트랜잭션에
 * 묶으면 그동안 아무것도 안 보이고 커넥션 하나를 1분간 붙잡는다. 장마다 커밋하면 앱이 목록을 다시 조회할
 * 때마다 칸이 하나씩 채워진다(§7 "칸이 채워지는 UI" 의 서버 쪽 전제).
 */
@Service
@Transactional(readOnly = true)
public class CoupleEmojiService {

    private static final Logger log = LoggerFactory.getLogger(CoupleEmojiService.class);

    private static final Feature FEATURE = Feature.AI_COUPLE_EMOJI;

    /**
     * Cloudinary 하위 폴더 두 개. 원본({@code SOURCE_SUBFOLDER})은 생성이 끝나면 서버가 지운다(§9) —
     * 그래서 <b>이 폴더의 URL 만</b> 원본으로 받고, 이 폴더의 것만 지운다. 아무 URL 이나 받아 지우면
     * 상대 피드 사진 URL 을 넣어 지워버리는 경로가 된다.
     */
    static final String SOURCE_SUBFOLDER = "emoji-source";
    static final String RESULT_SUBFOLDER = "couple-emoji";

    /**
     * 한 세트 안에서 동시에 그릴 장 수. {@code AiJobService} 풀을 4로 둔 것과 같은 이유 —
     * 이 작업은 CPU 가 아니라 외부 응답 대기라 많이 띄워봐야 Gemini 이미지 한도만 더 빨리
     * 건드린다. 세트가 동시에 여러 개 돌면 그 배수가 된다는 점도 같이 봐야 한다.
     */
    private static final int IMAGE_CONCURRENCY = 4;

    private final CoupleEmojiRepository repository;
    private final RelationRepository relationRepository;
    private final UserRepository userRepository;
    private final GeminiClient geminiClient;
    private final PlanGuard planGuard;
    private final CloudinaryProperties cloudinaryProperties;
    private final CloudinaryImageFetcher imageFetcher;
    private final CloudinaryImageUploader imageUploader;
    private final CloudinaryImageDeleter imageDeleter;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final TransactionTemplate transactionTemplate;

    public CoupleEmojiService(CoupleEmojiRepository repository,
                              RelationRepository relationRepository,
                              UserRepository userRepository,
                              GeminiClient geminiClient,
                              PlanGuard planGuard,
                              CloudinaryProperties cloudinaryProperties,
                              CloudinaryImageFetcher imageFetcher,
                              CloudinaryImageUploader imageUploader,
                              CloudinaryImageDeleter imageDeleter,
                              NotificationService notificationService,
                              CoupleEventPublisher coupleEventPublisher,
                              PlatformTransactionManager transactionManager) {
        this.repository = repository;
        this.relationRepository = relationRepository;
        this.userRepository = userRepository;
        this.geminiClient = geminiClient;
        this.planGuard = planGuard;
        this.cloudinaryProperties = cloudinaryProperties;
        this.imageFetcher = imageFetcher;
        this.imageUploader = imageUploader;
        this.imageDeleter = imageDeleter;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        // 장마다 독립 커밋 — 혹시 바깥에 트랜잭션이 있어도 합류하지 않는다(generate 주석).
        this.transactionTemplate.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** 요청 스레드 → 백그라운드 작업으로 넘기는 것 — 검증이 끝난 값만 담는다 */
    public record GenerationTicket(Long relationId, Long userId, Long subjectUserId, String sourceImageUrl,
                                   List<CoupleEmojiEmotion> emotions) {
    }

    /**
     * 원본 사진 업로드 서명 — 전용 폴더({@link #SOURCE_SUBFOLDER})로. 사진 한도({@code PHOTO_UPLOAD})는
     * 일반 사진과 같이 센다(별도 예외 없음, §6).
     */
    public UploadSignatureResponse sourceUploadSignature(Long userId) {
        activeCouple(userId);
        if (!cloudinaryProperties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        planGuard.consume(userId, Feature.PHOTO_UPLOAD);
        return CloudinarySigner.sign(cloudinaryProperties, sourceFolder());
    }

    /**
     * 요청 스레드: 관계·대상 검증 + 한도 차감. 여기서 던지는 402/429 는 그대로 HTTP 응답이 된다.
     */
    public GenerationTicket prepare(Long userId, GenerateCoupleEmojiRequest request) {
        // 폴더 검사가 먼저다 — 아래 실패 경로에서 이 URL 을 지우는데, 우리 폴더의 것만 지워야 한다.
        if (!isSourceUrl(request.sourceImageUrl())) {
            throw new BusinessException(ErrorCode.INVALID_PHOTO_URL);
        }
        try {
            Relation couple = activeCouple(userId);
            Long subject = request.subjectUserId() != null ? request.subjectUserId() : couple.partnerOf(userId);
            if (subject == null || !couple.involves(subject)) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "우리 둘 중 한 사람의 사진이어야 해요.");
            }
            geminiClient.requireImageConfiguredAndCountUsage(userId, FEATURE);
            return new GenerationTicket(couple.getId(), userId, subject, request.sourceImageUrl(),
                    resolveEmotions(request.emotions()));
        } catch (RuntimeException e) {
            /*
             * 앱은 업로드 → 접수 순서라, 여기서 거절(402·429·관계 없음·대상 오류)해도 원본은 이미
             * emoji-source/ 에 올라가 있다. 백그라운드 작업이 안 뜨니 지울 사람도 없다 — 거절과 함께
             * 지운다. "사진은 저장하지 않아요"(§9)는 거절 경로에서도 지켜져야 한다(2026-09-08 점검 #3).
             */
            imageDeleter.deleteAll(List.of(request.sourceImageUrl()));
            throw e;
        }
    }

    /**
     * 백그라운드 작업: 원본 → 외형 사실(텍스트 모델) → 감정 6종(이미지 모델) → 장마다 업로드·저장.
     *
     * <p>환불 규칙(§5-1): 한 장이라도 살렸으면 환불하지 않는다. 하나도 못 살렸을 때만 되돌리고,
     * 마지막 실패의 사유를 그대로 사용자에게 보여준다(거절이면 "다른 사진", 그 밖엔 "잠시 후").
     * 원본 다운로드 실패는 우리가 직접 되돌리고, 텍스트 모델 실패는 {@code GeminiClient} 가 스스로 되돌린다
     * — 두 번 되돌리지 않도록 나눠 잡는다.
     *
     * <p><b>트랜잭션 밖에서 돈다</b>({@code NOT_SUPPORTED}). 클래스 기본값이 읽기 전용 트랜잭션인데, 그 안에서
     * 장마다 여는 {@link TransactionTemplate} 가 바깥 트랜잭션에 <b>합류</b>해 읽기 전용을 물려받는다 —
     * PostgreSQL 은 "cannot execute INSERT in a read-only transaction" 으로 거절한다(H2 는 강제하지 않아
     * 테스트에서 안 보였다. CLAUDE.md 6절 "PostgreSQL 로도 한 번"의 실제 사례). 1분 넘게 외부를 기다리는
     * 메서드가 커넥션을 붙잡고 있어서도 안 된다.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public CoupleEmojiBatchResponse generate(GenerationTicket ticket) {
        try {
            return generateFrom(ticket);
        } finally {
            /*
             * 원본은 저장하지 않는다(§9) — 성공·실패·예외 어느 경로든 지운다. finally 인 이유: 예전엔 감정
             * 루프 뒤에서만 지워서, 다운로드 거절(PHOTO_TOO_LARGE 처럼 파일은 있는 실패)·외형 추출 실패·
             * 루프 밖으로 새는 예외에서 상대 얼굴이 emoji-source/ 에 남았다(2026-09-08 점검 #2).
             * 전용 폴더의 것만 받았으므로(prepare) 안전하다.
             */
            imageDeleter.deleteAll(List.of(ticket.sourceImageUrl()));
        }
    }

    /**
     * 이번에 그릴 감정 — 비어 있으면 전체.
     *
     * <p>중복을 걷어내고 {@link CoupleEmojiEmotion#values()} 순서로 되돌린다. 앱이 보낸 순서를
     * 그대로 믿으면 트레이·대기 화면의 칸 순서가 요청마다 달라진다(coupleEmojiEmotions.ts 주석).
     * 모르는 값은 역직렬화 단계에서 이미 걸리므로 여기서는 순서·중복만 본다.
     */
    private static List<CoupleEmojiEmotion> resolveEmotions(List<CoupleEmojiEmotion> requested) {
        if (requested == null || requested.isEmpty()) return List.of(CoupleEmojiEmotion.values());
        var wanted = new LinkedHashSet<>(requested);
        return java.util.Arrays.stream(CoupleEmojiEmotion.values()).filter(wanted::contains).toList();
    }

    /** 한 장 — 생성·업로드·저장. 스레드마다 따로 돌고 서로를 참조하지 않는다. */
    private CoupleEmoji generateOne(GenerationTicket ticket, CloudinaryImageFetcher.Image source,
                                    String facts, String batchId, CoupleEmojiEmotion emotion) {
        GeneratedImage image = geminiClient.generateImageInBackground(List.of(
                GeminiClient.imagePart(source.mimeType(), source.bytes()),
                GeminiClient.textPart(CoupleEmojiPrompts.imagePrompt(facts, emotion))));
        String url = imageUploader.upload(image.bytes(), image.mimeType(), RESULT_SUBFOLDER);
        return transactionTemplate.execute(status -> repository.save(CoupleEmoji.builder()
                .relationId(ticket.relationId())
                .createdBy(ticket.userId())
                .subjectUserId(ticket.subjectUserId())
                .batchId(batchId)
                .emotion(emotion)
                .imageUrl(url)
                .promptVersion(CoupleEmojiPrompts.VERSION)
                .identityFacts(facts)
                .build()));
    }

    private CoupleEmojiBatchResponse generateFrom(GenerationTicket ticket) {
        CloudinaryImageFetcher.Image source;
        try {
            source = imageFetcher.fetch(ticket.sourceImageUrl());
        } catch (RuntimeException e) {
            geminiClient.refund(ticket.userId(), FEATURE);
            throw e;
        }
        String facts = describe(ticket.userId(), source);

        String batchId = UUID.randomUUID().toString();
        List<CoupleEmojiEmotion> targets = ticket.emotions();

        /*
         * 감정별 생성을 <b>동시에</b> 돌린다. 장당 약 13초라 순차로는 감정 수에 그대로 비례해
         * 늘어난다 — 6종 80초는 견뎠지만 17종이면 약 220초로, 대기 화면으로 버틸 길이가 아니다.
         * 각 장은 서로를 전혀 참조하지 않고(같은 source·facts 를 읽기만 한다) 대부분 외부 응답
         * 대기라, 동시에 돌리는 것이 자연스럽다.
         *
         * <p>동시 실행 수는 {@link #IMAGE_CONCURRENCY} 로 묶는다. 전부 한꺼번에 던지면 Gemini
         * 이미지 한도를 그만큼 빨리 건드리고(AiJobService 풀을 4로 둔 것과 같은 이유), 여러 커플이
         * 동시에 만들면 그 배수가 된다. 세트 안에서 4장씩이면 17종 기준 약 60초다.
         *
         * <p>결과 순서는 {@code targets} 순서 그대로 유지한다 — 트레이·대기 화면이 감정 순서를
         * 전제로 칸을 그린다(coupleEmojiEmotions.ts 주석).
         */
        List<CoupleEmoji> saved = new ArrayList<>();
        List<String> failed = new ArrayList<>();
        RuntimeException lastFailure = null;
        ExecutorService pool = Executors.newFixedThreadPool(
                Math.min(IMAGE_CONCURRENCY, Math.max(1, targets.size())),
                r -> {
                    Thread t = new Thread(r, "couple-emoji");
                    t.setDaemon(true);
                    return t;
                });
        try {
            List<Future<CoupleEmoji>> futures = targets.stream()
                    .map(emotion -> pool.submit(() -> generateOne(ticket, source, facts, batchId, emotion)))
                    .toList();
            for (int i = 0; i < targets.size(); i++) {
                try {
                    saved.add(futures.get(i).get());
                } catch (ExecutionException | InterruptedException e) {
                    /*
                     * BusinessException 만 잡으면 base64 디코드(IllegalArgumentException)·DB 예외가
                     * 새어 나간다 — 그러면 이미 커밋된 장들은 이벤트·푸시 없는 반쪽 세트로 남고,
                     * 한 장도 못 살렸어도 환불이 없다. 어떤 예외든 "이 장 실패"로 분류한다.
                     */
                    if (e instanceof InterruptedException) Thread.currentThread().interrupt();
                    Throwable cause = e instanceof ExecutionException ee && ee.getCause() != null ? ee.getCause() : e;
                    lastFailure = cause instanceof RuntimeException re ? re
                            : new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
                    CoupleEmojiEmotion emotion = targets.get(i);
                    failed.add(emotion.name());
                    log.warn("우리 이모지 {} 생성 실패(relation={}): {}", emotion, ticket.relationId(),
                            cause instanceof BusinessException be ? be.getErrorCode() : cause.toString());
                }
            }
        } finally {
            pool.shutdown();
        }

        if (saved.isEmpty()) {
            geminiClient.refund(ticket.userId(), FEATURE);
            // 사용자에게는 BusinessException 의 한국어만 보여준다 — 그 밖의 예외는 일반 실패 문구로 감싼다
            throw lastFailure instanceof BusinessException be ? be : new BusinessException(ErrorCode.AI_ANALYSIS_FAILED);
        }

        coupleEventPublisher.publish(ticket.relationId(), CoupleEvent.COUPLE_EMOJI);
        notifyPartner(ticket);
        return new CoupleEmojiBatchResponse(batchId,
                saved.stream().map(CoupleEmojiResponse::from).toList(), failed);
    }

    /** 트레이 — 관계의 살아 있는 이모지 전부(최근 세트가 위). 둘 다 같은 목록을 본다. */
    public List<CoupleEmojiResponse> list(Long userId) {
        Relation couple = activeCouple(userId);
        return repository.findAllByRelationIdAndDeletedAtIsNullOrderByIdDesc(couple.getId()).stream()
                .map(CoupleEmojiResponse::from)
                .toList();
    }

    /** 한 장 숨기기 — 만든 사람이 아니어도 관계 멤버면 누구나(§9 "상대가 언제든 지울 수 있다") */
    @Transactional
    public void delete(Long userId, Long emojiId) {
        Relation couple = activeCouple(userId);
        CoupleEmoji emoji = repository.findByIdAndRelationIdAndDeletedAtIsNull(emojiId, couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.COUPLE_EMOJI_NOT_FOUND));
        emoji.hide();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.COUPLE_EMOJI);
    }

    /** 세트 통째로 숨기기 */
    @Transactional
    public void deleteBatch(Long userId, String batchId) {
        Relation couple = activeCouple(userId);
        List<CoupleEmoji> rows = repository.findAllByRelationIdAndBatchIdAndDeletedAtIsNull(couple.getId(), batchId);
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.COUPLE_EMOJI_NOT_FOUND);
        }
        rows.forEach(CoupleEmoji::hide);
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.COUPLE_EMOJI);
    }

    // ---- 내부 ----

    /** 1단계 — 외형 사실 추출. 실패하면 GeminiClient 가 한도를 되돌리고 던진다(클래스 주석). */
    private String describe(Long userId, CloudinaryImageFetcher.Image source) {
        JsonNode facts = geminiClient.generateJsonInBackground(userId, FEATURE,
                List.of(GeminiClient.imagePart(source.mimeType(), source.bytes()),
                        GeminiClient.textPart(CoupleEmojiPrompts.DESCRIBE)),
                CoupleEmojiPrompts.DESCRIBE_SCHEMA);
        return CoupleEmojiPrompts.factsOf(facts);
    }

    private void notifyPartner(GenerationTicket ticket) {
        Relation couple = relationRepository.findById(ticket.relationId()).orElse(null);
        Long partnerId = couple == null ? null : couple.partnerOf(ticket.userId());
        if (partnerId == null) {
            return;
        }
        String name = userRepository.findById(ticket.userId()).map(User::getName).orElse("상대방");
        // 몰래 만들 수 없다(§9 3번) — 상대 얼굴이 쓰였든 아니든 세트가 생기면 상대에게 알린다.
        notificationService.notify(partnerId, NotificationCategory.PARTNER, "우리 이모지",
                name + "님이 우리 이모지를 만들었어요 👀", PushLinks.chat(ticket.relationId()));
    }

    private String sourceFolder() {
        return cloudinaryProperties.getFolder() + "/" + SOURCE_SUBFOLDER;
    }

    /** 전용 폴더에 올라간 Cloudinary URL 인가 — 클래스 상수 주석 참고 */
    boolean isSourceUrl(String url) {
        /*
         * public_id 는 정규화 없이 접두사만 보므로 "emoji-source/../<다른 폴더>/x.jpg" 가 게이트를 지날 수
         * 있다(2026-09-08 점검 #17). 우리가 서명해 올린 URL 에는 상위 경로·쿼리·프래그먼트가 없으니 그런
         * 문자가 보이면 그냥 거절한다 — CDN 이 ".." 를 어떻게 해석하든 상관없어진다.
         */
        if (url == null || url.contains("..") || url.contains("?") || url.contains("#")) {
            return false;
        }
        String publicId = imageDeleter.extractPublicId(url);
        return publicId != null && publicId.startsWith(sourceFolder() + "/");
    }

    /**
     * 접수 실패(AI 큐 포화) — {@link #prepare} 가 이미 한도를 차감했고 원본은 올라가 있는데 이제
     * {@link #generate} 는 돌지 않는다. 둘 다 되돌린다(2026-09-08 점검 #9). 컨트롤러가
     * {@code AiJobService.submit} 의 거절 콜백으로 부른다.
     */
    public void abandon(GenerationTicket ticket) {
        geminiClient.refund(ticket.userId(), FEATURE);
        imageDeleter.deleteAll(List.of(ticket.sourceImageUrl()));
    }

    private Relation activeCouple(Long userId) {
        return relationRepository
                .findByUserAndTypeAndStatus(userId, RelationType.COUPLE, RelationStatus.ACTIVE)
                .stream().findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND,
                        "커플 연결 후 사용할 수 있는 기능이에요."));
    }
}
