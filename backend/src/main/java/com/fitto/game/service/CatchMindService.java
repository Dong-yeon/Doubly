package com.fitto.game.service;

import com.fitto.chat.domain.MessageType;
import com.fitto.chat.dto.ChatMessageResponse;
import com.fitto.chat.service.ChatService;
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
import com.fitto.common.upload.CloudinaryProperties;
import com.fitto.common.upload.CloudinarySigner;
import com.fitto.common.upload.UploadSignatureResponse;
import com.fitto.game.catchmind.Answers;
import com.fitto.game.catchmind.CatchMindWords;
import com.fitto.game.catchmind.Strokes;
import com.fitto.game.domain.CatchMindGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.CatchMindResponse;
import com.fitto.game.dto.CatchMindWordsResponse;
import com.fitto.game.dto.GuessResultResponse;
import com.fitto.game.dto.StartCatchMindRequest;
import com.fitto.game.repository.CatchMindGameRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Random;

/**
 * 캐치마인드 — docs/CATCH_MIND_2026-09-14.md.
 *
 * <p><b>비동기다.</b> 다 그린 그림을 한 번에 올리고, 상대는 아무 때나 열어서 맞힌다. 실시간
 * 스트로크 중계가 없으므로 둘이 동시에 접속해 있을 필요가 없다 — 떨어져 있을 때 앱을 쓰는
 * 이 서비스의 전제와 맞다(설계 2026-09-09 이 실시간 2인을 접은 이유가 그것이었다).
 *
 * <p>커플당 진행 중인 판은 하나. 상대가 아직 못 맞혔는데 새 문제를 또 내면 밀린 숙제가 된다.
 */
@Service
@Transactional(readOnly = true)
public class CatchMindService {

    private static final Logger log = LoggerFactory.getLogger(CatchMindService.class);
    /** 제시어 후보 개수 — 셋이면 "그릴 만한 게 하나는 있다"가 되고, 더 늘리면 고르다 지친다 */
    private static final int CANDIDATE_COUNT = 3;
    /**
     * 채팅 공유용 그림 PNG 를 받는 Cloudinary 하위 폴더.
     *
     * <p>전용 폴더로 받는 이유는 우리 이모지 원본과 같다 — 채팅에 실을 URL 을
     * <b>폴더로 검증</b>할 수 있어야 아무 URL 이나 말풍선에 박히는 걸 막는다.
     */
    private static final String SHARE_SUBFOLDER = "catch-mind";
    /**
     * 틀린 시도를 채팅 카드로 남기는 상한.
     *
     * <p>이 게임은 <b>시도 횟수에 제한이 없다</b>(아래 {@link #guess} 주석). 그래서 틀린 시도를
     * 전부 흘리면 한 판이 채팅방을 수십 줄로 덮는다 — 재미가 소음이 되는 지점이다. 앞쪽 몇 번만
     * 남기고 그 뒤는 게임 화면의 "이렇게 찍었어요" 칩에만 쌓인다(그쪽은 원래 전부 보인다).
     */
    private static final int WRONG_GUESS_CARD_LIMIT = 5;
    /**
     * 채팅에 남는 그림에 붙는 한 줄.
     *
     * <p>사진만 덜렁 올라가면 받는 쪽은 이게 게임인지 그냥 사진인지 모른다. 푸시 알림
     * ("이게 뭘까? 🎨")은 알림을 끈 사람에게 닿지 않으므로, 채팅 자체에 초대말이 있어야 한다.
     *
     * <p>제시어는 당연히 넣지 않는다 — 같은 방에서 둘이 같이 읽는다(§onWrongGuess 주석).
     */
    private static final String SHARE_CAPTION = "🎨 캐치마인드예요! 시작해보세요";

    private final CatchMindGameRepository gameRepository;
    private final RelationRepository relationRepository;
    private final GameCouples couples;
    private final PlanGuard planGuard;
    private final NotificationService notificationService;
    private final CoupleEventPublisher coupleEventPublisher;
    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;
    private final CloudinaryProperties cloudinaryProperties;
    private final CloudinaryImageDeleter imageDeleter;
    private final Random random = new SecureRandom();

    public CatchMindService(CatchMindGameRepository gameRepository,
                            RelationRepository relationRepository,
                            GameCouples couples,
                            PlanGuard planGuard,
                            NotificationService notificationService,
                            CoupleEventPublisher coupleEventPublisher,
                            ChatService chatService,
                            SimpMessagingTemplate messagingTemplate,
                            CloudinaryProperties cloudinaryProperties,
                            CloudinaryImageDeleter imageDeleter) {
        this.gameRepository = gameRepository;
        this.relationRepository = relationRepository;
        this.couples = couples;
        this.planGuard = planGuard;
        this.notificationService = notificationService;
        this.coupleEventPublisher = coupleEventPublisher;
        this.chatService = chatService;
        this.messagingTemplate = messagingTemplate;
        this.cloudinaryProperties = cloudinaryProperties;
        this.imageDeleter = imageDeleter;
    }

    /** 진행 중인 판 — 없으면 null */
    public CatchMindResponse current(Long userId) {
        Relation couple = couples.active(userId);
        return gameRepository
                .findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(couple.getId(), GameStatus.IN_PROGRESS)
                .map(g -> toResponse(g, userId, couple))
                .orElse(null);
    }

    /** 제시어 후보 — 서로 다른 카테고리에서 셋 */
    public CatchMindWordsResponse words(Long userId) {
        couples.active(userId); // 커플 연결 확인만 — 후보 자체는 커플과 무관하다
        List<CatchMindWordsResponse.Item> items = CatchMindWords.candidates(random, CANDIDATE_COUNT)
                .stream()
                .map(c -> new CatchMindWordsResponse.Item(c.category(), c.word()))
                .toList();
        return new CatchMindWordsResponse(items);
    }

    /**
     * 그림 제출 = 판 시작.
     *
     * <p>스도쿠·오목의 {@code start} 와 달리 진행 중인 판이 있으면 <b>거절한다</b>. 저쪽은
     * 둘이 같은 판을 보는 구조라 "그 판을 돌려주면" 되지만, 여기서는 판마다 문제와 그림이
     * 다르다 — 남의 문제를 돌려받으면 방금 그린 그림이 조용히 사라진 것처럼 보인다.
     */
    @Transactional
    public CatchMindResponse start(Long userId, StartCatchMindRequest req) {
        String word = req.word().trim();
        if (word.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "제시어를 입력해주세요.");
        }
        if (!Strokes.isValid(req.strokes())) {
            throw new BusinessException(ErrorCode.GAME_DRAWING_INVALID);
        }

        Relation couple = couples.active(userId);
        // 관계 행을 잠가 "진행 중 판 확인 → 생성"을 직렬화한다(둘이 동시에 내도 하나만 선다)
        Relation locked = relationRepository.findByIdForUpdate(couple.getId())
                .orElseThrow(() -> new BusinessException(ErrorCode.RELATION_NOT_FOUND));
        if (gameRepository.findFirstByCoupleIdAndStatusOrderByCreatedAtDesc(
                locked.getId(), GameStatus.IN_PROGRESS).isPresent()) {
            throw new BusinessException(ErrorCode.GAME_ALREADY_DRAWING);
        }

        planGuard.require(userId, Feature.COUPLE_GAME);

        CatchMindGame game = gameRepository.save(CatchMindGame.builder()
                .coupleId(locked.getId())
                .createdBy(userId)
                .word(word)
                .strokes(req.strokes())
                .build());

        Long partnerId = locked.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "이게 뭘까? 🎨",
                    couples.userName(userId) + "님이 그림을 보냈어요. 맞혀보세요!",
                    PushLinks.GAME_CATCH_MIND);
        }
        shareDrawing(userId, locked, req.shareImageUrl());
        coupleEventPublisher.publish(locked.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, locked);
    }

    /**
     * 정답 시도 — 맞히면 판이 끝나고 채팅에 카드가 남는다.
     * 틀려도 <b>횟수 제한은 없다</b>. 막히면 초성을 열거나 포기하면 되고, 시도 횟수로 압박을
     * 주는 건 "같이 하는 것"을 시험으로 만든다.
     */
    @Transactional
    public GuessResultResponse guess(Long userId, Long gameId, String answer) {
        String trimmed = answer.trim();
        if (trimmed.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "정답을 입력해주세요.");
        }

        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isDrawer(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_GUESSER);
        }

        boolean correct = Answers.matches(game.getWord(), trimmed);
        if (correct) {
            game.solve();
            onSolved(userId, game, couple);
        } else {
            game.addWrongGuess(trimmed);
            onWrongGuess(userId, game, couple, trimmed);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return new GuessResultResponse(correct, toResponse(game, userId, couple));
    }

    /** 초성 힌트 — 열어도 실패로 치지 않는다. 막힌 채로 끝나는 것보다 낫다. */
    @Transactional
    public CatchMindResponse revealHint(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) {
            throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);
        }
        if (game.isDrawer(userId)) {
            throw new BusinessException(ErrorCode.GAME_NOT_GUESSER);
        }
        game.revealHint();
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
        return toResponse(game, userId, couple);
    }

    /**
     * 포기·접기 — 기록에 남지 않는다(두 게임과 같은 규칙).
     * 그린 쪽도 접을 수 있다. 상대가 며칠째 안 열면 그림 하나 때문에 다음 판을 못 낸다.
     */
    @Transactional
    public void giveUp(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        CatchMindGame game = lockedGame(gameId, couple);
        if (!game.isInProgress()) return;
        game.abandon();

        Long partnerId = couple.partnerOf(userId);
        if (partnerId != null) {
            notificationService.notify(partnerId, NotificationCategory.PARTNER, "캐치마인드 — 정답 공개 🎨",
                    "정답은 '" + game.getWord() + "' 였어요.", PushLinks.GAME_CATCH_MIND);
        }
        coupleEventPublisher.publish(couple.getId(), CoupleEvent.GAME);
    }

    /** 맞힌 판 최근 20개 — 지난 그림을 다시 볼 수 있다 */
    public List<CatchMindResponse> history(Long userId) {
        Relation couple = couples.active(userId);
        String partnerName = couples.partnerName(couple, userId);
        return gameRepository
                .findTop20ByCoupleIdAndStatusOrderByCompletedAtDesc(couple.getId(), GameStatus.COMPLETED)
                .stream()
                .map(g -> CatchMindResponse.of(g, userId, partnerName))
                .toList();
    }

    /**
     * 채팅 공유용 그림 PNG 업로드 서명.
     *
     * <p><b>사진 한도({@code PHOTO_UPLOAD})를 세지 않는다.</b> 사진첩 업로드는 사용자가
     * 원하는 만큼 쌓을 수 있어 한도를 걸지만(UploadController), 이 사진은 <b>게임 흐름이
     * 이미 상한을 걸어 둔다</b> — 진행 중인 판은 커플당 하나뿐이고(GAME_ALREADY_DRAWING)
     * 판당 그림은 한 장이다. 여기서 또 세면 무료 사용자가 캐치마인드를 하는 것만으로
     * 사진첩 한도가 깎인다. 음성 클립(VoiceClipController.uploadSignature)과 같은 판단이다.
     *
     * <p>판 생성 한도는 그대로다 — 그림 제출은 {@code Feature.COUPLE_GAME} 을 지난다.
     */
    public UploadSignatureResponse shareUploadSignature(Long userId) {
        couples.active(userId);
        if (!cloudinaryProperties.isConfigured()) {
            throw new BusinessException(ErrorCode.UPLOAD_NOT_CONFIGURED);
        }
        return CloudinarySigner.sign(cloudinaryProperties, shareFolder());
    }

    // ── 내부 ─────────────────────────────────────────────────────────────

    private void onSolved(Long guesserId, CatchMindGame game, Relation couple) {
        String guesserName = couples.userName(guesserId);
        String title = "캐치마인드 정답! 🎨";
        String body = "'" + game.getWord() + "' · " + guesserName + " "
                + game.guessCount() + "번 만에"
                + (game.isHintUsed() ? " (초성 힌트)" : "");

        Long drawerId = game.getCreatedBy();
        if (!drawerId.equals(guesserId)) {
            notificationService.notify(drawerId, NotificationCategory.PARTNER, title,
                    guesserName + "님이 '" + game.getWord() + "'을(를) 맞혔어요!", PushLinks.GAME_CATCH_MIND);
        }
        // content 는 화면에 그대로 띄워도 말이 되는 문장이다(STREAK_CARD·GAME_CARD 규칙)
        postCard(guesserId, couple.getId(), MessageType.GAME_CARD, title + " " + body, null, "결과");
    }

    /**
     * 틀린 시도를 채팅에 남긴다 — 맞히는 과정 자체가 둘의 대화가 되게.
     *
     * <p><b>제시어는 절대 싣지 않는다.</b> 이 카드는 그린 사람과 맞히는 사람이 같은 방에서
     * 같이 읽으므로, 정답이 한 글자라도 새면 게임이 그 자리에서 끝난다.
     *
     * <p>푸시 알림은 보내지 않는다. 그린 사람은 게임 화면에서 이미 시도를 보고 있고, 시도마다
     * 푸시를 쏘면 한 판에 알림이 열 번 온다 — 끄고 싶어지는 종류의 알림이다.
     */
    private void onWrongGuess(Long guesserId, CatchMindGame game, Relation couple, String answer) {
        if (game.guessCount() > WRONG_GUESS_CARD_LIMIT) return;
        String body = "🎨 " + couples.userName(guesserId) + "님: \"" + answer + "\" … 아니에요!";
        postCard(guesserId, couple.getId(), MessageType.GAME_CARD, body, null, "틀린 시도");
    }

    /**
     * 보낸 그림을 채팅에 사진으로 남긴다.
     *
     * <p>앱이 SVG 를 PNG 로 렌더해 {@link #shareUploadSignature} 서명으로 올린 URL 을 실어 보낸다.
     * <b>새 MessageType 을 만들지 않고 {@code IMAGE} 로 보내는 이유</b>: 획 데이터를 content 에
     * 담으면 그 타입을 모르는 구버전 앱이 평문 말풍선으로 폴백해 "0,1,500,500;…" 을 그대로
     * 띄운다(ChatRoomScreen 의 폴백). 사진이면 어느 버전에서도 사진이고, 확대·저장도 공짜다.
     *
     * <p>URL 이 없으면(웹·렌더 실패) 조용히 넘어간다 — 그림 공유는 부가 기능이고, 판은 이미 섰다.
     */
    private void shareDrawing(Long drawerId, Relation couple, String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) return;
        if (!isShareUrl(imageUrl)) {
            // 우리가 서명해 준 폴더가 아니면 채팅에 싣지 않는다 — 임의 URL 주입 경로가 된다
            log.warn("캐치마인드 공유 URL 거절 couple={}", couple.getId());
            return;
        }
        postCard(drawerId, couple.getId(), MessageType.IMAGE, SHARE_CAPTION, imageUrl, "그림 공유");
    }

    /**
     * 카드 한 장을 남기고 방에 흘린다. <b>실패해도 게임 진행을 되돌리지 않는다</b> —
     * 채팅 카드는 곁가지이고, 여기서 예외가 올라가면 정답 처리나 판 생성이 롤백된다.
     */
    private void postCard(Long senderId, Long relationId, MessageType type,
                          String content, String imageUrl, String what) {
        try {
            ChatMessageResponse saved =
                    chatService.postSystemCard(senderId, relationId, type, content, imageUrl);
            messagingTemplate.convertAndSend("/sub/rooms/" + relationId, saved);
        } catch (Exception e) {
            log.warn("캐치마인드 {} 채팅 카드 실패 couple={}: {}", what, relationId, e.getMessage());
        }
    }

    private String shareFolder() {
        return cloudinaryProperties.getFolder() + "/" + SHARE_SUBFOLDER;
    }

    /** 전용 폴더에 올라간 Cloudinary URL 인가 — CoupleEmojiService.isSourceUrl 과 같은 규칙 */
    private boolean isShareUrl(String url) {
        /*
         * public_id 는 정규화 없이 접두사만 보므로 "catch-mind/../<다른 폴더>/x.png" 가 게이트를
         * 지날 수 있다. 우리가 서명해 올린 URL 에는 상위 경로·쿼리·프래그먼트가 없으니 그런 문자가
         * 보이면 그냥 거절한다.
         */
        if (url.contains("..") || url.contains("?") || url.contains("#")) return false;
        String publicId = imageDeleter.extractPublicId(url);
        return publicId != null && publicId.startsWith(shareFolder() + "/");
    }

    /** 행을 잠그고 이 커플의 판인지 확인해 가져온다 — 상태를 바꾸는 모든 경로가 여기를 지난다. */
    private CatchMindGame lockedGame(Long gameId, Relation couple) {
        return gameRepository.findByIdForUpdate(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
    }

    private CatchMindResponse toResponse(CatchMindGame game, Long viewerId, Relation couple) {
        return CatchMindResponse.of(game, viewerId, couples.partnerName(couple, viewerId));
    }
}
