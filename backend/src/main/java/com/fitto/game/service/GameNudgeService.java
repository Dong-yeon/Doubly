package com.fitto.game.service;

import com.fitto.common.exception.BusinessException;
import com.fitto.common.exception.ErrorCode;
import com.fitto.common.notification.NotificationCategory;
import com.fitto.common.notification.NotificationService;
import com.fitto.common.notification.PushLinks;
import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.GameType;
import com.fitto.game.domain.SudokuGame;
import com.fitto.game.repository.CoupleGameRepository;
import com.fitto.relation.domain.Relation;
import com.fitto.relation.repository.RelationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 게임 재촉("살짝 찌르기")과 멈춘 판 리마인더 — 종목 공통. docs/GAME_NUDGE_2026-09-30.md.
 *
 * <p>번갈아 두는 게임은 상대가 안 들어오면 기다리는 쪽이 할 수 있는 게 "판 접기"뿐이었다. 종목마다 따로
 * 만들지 않고 여기 한 벌이다 — 종목은 {@link CoupleGame#awaitedSide()} 로 "지금 누구를 기다리는가"만 답한다.
 *
 * <p>둘 다 <b>판이 움직인 것으로 치지 않는다</b>. 시각은 벌크 update 로만 남겨 updated_at 을 그대로 둔다 —
 * 그래야 "2분 조용하면 차례 알림"({@link GameQuiet})과 멈춘 판 판정이 흔들리지 않는다.
 */
@Service
public class GameNudgeService {

    private static final Logger log = LoggerFactory.getLogger(GameNudgeService.class);
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");

    /** 찌르기 간격 — 판마다 한 사람당 하루 한 번. 그 이상은 재촉이 아니라 독촉이다 */
    static final Duration NUDGE_GAP = Duration.ofHours(24);
    /** 이만큼 움직임이 없으면 멈춘 판으로 보고 한 번 알린다 */
    static final Duration STALL = Duration.ofHours(24);
    /** 리마인더를 보내는 시간대(KST) — 밤에 게임 알림으로 깨우지 않는다 */
    static final int REMIND_FROM_HOUR = 10;
    static final int REMIND_UNTIL_HOUR = 22;

    private final CoupleGameRepository games;
    private final GameCouples couples;
    private final RelationRepository relations;
    private final NotificationService notifications;

    public GameNudgeService(CoupleGameRepository games, GameCouples couples,
                            RelationRepository relations, NotificationService notifications) {
        this.games = games;
        this.couples = couples;
        this.relations = relations;
        this.notifications = notifications;
    }

    /**
     * 기다리는 쪽이 상대를 부른다.
     *
     * @return 찌른 시각 — 앱이 "오늘은 이미 알렸어요"를 미리 보여줄 수 있게
     * @throws BusinessException 판이 없거나 끝났음 · 내 차례임({@code GAME_NUDGE_MY_TURN}) · 24시간 안에 이미 찔렀음
     */
    @Transactional
    public LocalDateTime nudge(Long userId, Long gameId) {
        Relation couple = couples.active(userId);
        CoupleGame game = games.findById(gameId)
                .filter(g -> g.getCoupleId().equals(couple.getId()))
                .orElseThrow(() -> new BusinessException(ErrorCode.GAME_NOT_FOUND));
        if (!game.isInProgress()) throw new BusinessException(ErrorCode.GAME_NOT_IN_PROGRESS);

        char mine = game.sideOf(userId);
        if (game.awaitedSide() == mine) throw new BusinessException(ErrorCode.GAME_NUDGE_MY_TURN);

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime last = game.nudgedAtBy(mine);
        if (last != null && Duration.between(last, now).compareTo(NUDGE_GAP) < 0) {
            throw new BusinessException(ErrorCode.GAME_NUDGE_TOO_SOON);
        }
        Long partnerId = couple.partnerOf(userId);
        if (partnerId == null) throw new BusinessException(ErrorCode.RELATION_NOT_FOUND);

        if (mine == CoupleGame.OWNER_CREATOR) games.markNudgedByCreator(gameId, now);
        else games.markNudgedByPartner(gameId, now);

        String label = labelOf(game.getGameType());
        notifications.notify(partnerId, NotificationCategory.PARTNER,
                label + " 👋",
                couples.userName(userId) + "님이 " + label + " 판에서 기다리고 있어요.",
                linkOf(game.getGameType()));
        return now;
    }

    /** 매시 15분 — 낮 시간에만 멈춘 판을 알린다. 테스트는 스케줄러가 꺼져 있어 {@link #remindStalled()} 를 직접 부른다 */
    @Scheduled(cron = "0 15 * * * *", zone = "Asia/Seoul")
    public void remindHourly() {
        int hour = ZonedDateTime.now(KST).getHour();
        if (hour < REMIND_FROM_HOUR || hour >= REMIND_UNTIL_HOUR) return;
        int sent = remindStalled();
        if (sent > 0) log.info("멈춘 게임 판 리마인더 {}판", sent);
    }

    /**
     * 24시간 움직임이 없는 판마다 한 번, 기다리는 쪽에 알린다(차례가 없으면 둘 다).
     * 알린 뒤 판이 다시 움직였다 멈추면 그 멈춤에 또 한 번 — 같은 멈춤에 두 번은 없다.
     *
     * @return 알린 판 수
     */
    @Transactional
    public int remindStalled() {
        LocalDateTime now = LocalDateTime.now();
        int count = 0;
        for (CoupleGame game : games.findStalled(GameStatus.IN_PROGRESS, now.minus(STALL))) {
            // 오늘의 스도쿠는 그날의 판이라 멈춰도 부를 일이 아니다 — 내일은 새 판이다
            if (game instanceof SudokuGame s && s.isDaily()) continue;
            Relation couple = relations.findById(game.getCoupleId()).orElse(null);
            if (couple == null || !couple.isActive()) continue;

            Long creator = game.getCreatedBy();
            Long other = couple.partnerOf(creator);
            if (other == null) continue;

            List<Long> targets = new ArrayList<>(2);
            char awaited = game.awaitedSide();
            if (awaited != CoupleGame.OWNER_PARTNER) targets.add(creator);
            if (awaited != CoupleGame.OWNER_CREATOR) targets.add(other);

            String label = labelOf(game.getGameType());
            for (Long target : targets) {
                notifications.notify(target, NotificationCategory.PARTNER,
                        label + " 판이 기다려요",
                        couples.partnerName(couple, target) + "님과 하던 " + label + " 판이 멈춰 있어요. 이어서 해볼까요?",
                        linkOf(game.getGameType()));
            }
            games.markReminded(game.getId(), now);
            count++;
        }
        return count;
    }

    static String labelOf(GameType type) {
        return switch (type) {
            case SUDOKU -> "협동 스도쿠";
            case OMOK -> "오목";
            case CATCH_MIND -> "캐치마인드";
            case PUZZLE_BATTLE -> "연쇄 퍼즐";
            case WALL_RACE -> "길막기";
        };
    }

    static String linkOf(GameType type) {
        return switch (type) {
            case SUDOKU -> PushLinks.GAME_SUDOKU;
            case OMOK -> PushLinks.GAME_OMOK;
            case CATCH_MIND -> PushLinks.GAME_CATCH_MIND;
            case PUZZLE_BATTLE -> PushLinks.GAME_PUZZLE;
            case WALL_RACE -> PushLinks.GAME_WALL_RACE;
        };
    }
}
