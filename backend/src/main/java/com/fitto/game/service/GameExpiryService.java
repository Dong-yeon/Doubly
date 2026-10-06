package com.fitto.game.service;

import com.fitto.common.event.CoupleEvent;
import com.fitto.common.event.CoupleEventPublisher;
import com.fitto.common.time.KstClock;
import com.fitto.game.domain.CoupleGame;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.domain.SudokuGame;
import com.fitto.game.repository.CoupleGameRepository;
import com.fitto.game.repository.SudokuGameRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 버려진 판 정리 — 종목 공통. docs/game-current-state.md 8-1 #6.
 *
 * <p>판에는 만료가 없었다. 리마인더는 7일이 넘은 판을 "버려진 판"으로 보고 더 부르지 않지만
 * ({@link GameNudgeService#ABANDONED}) 판은 IN_PROGRESS 로 영원히 남아, 같은 종목의 "새 판"을 누르면
 * 몇 주 전 판이 열리고 캐치마인드는 아예 새 그림을 낼 수 없었다(GAME_ALREADY_DRAWING). 두 가지를 접는다.
 * <ol>
 *   <li><b>7일 넘게 아무도 움직이지 않은 판</b> — 리마인더가 포기한 바로 그 판. 기준을 같은 상수로 묶어
 *       "알리기를 멈춘 판"과 "정리하는 판"이 어긋나지 않게 한다.</li>
 *   <li><b>날짜가 지난 오늘의 판</b> — 그날의 판은 그날로 끝이다. 오늘의 판을 열 때도 그 자리에서 접지만
 *       ({@code SudokuService.startDaily}) 허브 카드가 "진행 중"으로 남지 않게 새벽에 한 번 더 거둔다.</li>
 * </ol>
 *
 * <p>접은 판은 사용자가 접은 판과 같다(ABANDONED) — 기록·전적·스트릭에 남지 않는다. 푸시는 보내지 않는다:
 * 24시간째에 리마인더가 이미 한 번 불렀고, 일주일 뒤의 "판을 정리했어요"는 소식이 아니라 소음이다.
 */
@Service
public class GameExpiryService {

    private static final Logger log = LoggerFactory.getLogger(GameExpiryService.class);

    /** 이보다 오래 움직임이 없으면 접는다 — 리마인더가 부르기를 멈추는 기준과 같다 */
    static final Duration STALE = GameNudgeService.ABANDONED;
    /**
     * 지난 오늘의 판이라도 방금까지 풀고 있었으면 두고 본다 — 자정을 넘겨 푸는 중일 수 있다.
     * 새벽 4시에 도므로 실제로 걸리는 일은 드물다.
     */
    static final Duration DAILY_GRACE = Duration.ofMinutes(30);

    private final CoupleGameRepository games;
    private final SudokuGameRepository sudokuGames;
    private final CoupleEventPublisher coupleEventPublisher;

    public GameExpiryService(CoupleGameRepository games,
                             SudokuGameRepository sudokuGames,
                             CoupleEventPublisher coupleEventPublisher) {
        this.games = games;
        this.sudokuGames = sudokuGames;
        this.coupleEventPublisher = coupleEventPublisher;
    }

    /**
     * 매일 새벽 4시(KST). <b>여기에 {@code @Transactional} 이 있어야 한다</b> — 스케줄러는 프록시를 거쳐 이
     * 메서드만 부르고, 안의 {@code expire()} 는 자기 호출이라 그쪽 애너테이션이 걸리지 않는다
     * ({@code GameNudgeService.remindHourly} 에서 실제로 났던 사고).
     */
    @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void expireDaily() {
        int n = expire();
        if (n > 0) log.info("버려진 게임 판 정리 {}판", n);
    }

    /** @return 접은 판 수 */
    @Transactional
    public int expire() {
        LocalDateTime now = LocalDateTime.now();
        Map<Long, CoupleGame> targets = new LinkedHashMap<>();

        for (CoupleGame g : games.findByStatusAndUpdatedAtBefore(GameStatus.IN_PROGRESS, now.minus(STALE))) {
            targets.put(g.getId(), g);
        }
        LocalDateTime graceStart = now.minus(DAILY_GRACE);
        for (SudokuGame g : sudokuGames.findByStatusAndDailyDateBefore(GameStatus.IN_PROGRESS, KstClock.today())) {
            if (g.getUpdatedAt() != null && g.getUpdatedAt().isAfter(graceStart)) continue;
            targets.putIfAbsent(g.getId(), g);
        }

        Set<Long> couples = new TreeSet<>();
        for (CoupleGame g : targets.values()) {
            g.abandon();
            couples.add(g.getCoupleId());
        }
        // 열려 있는 화면이 다시 읽게 — 커밋 뒤에 나간다
        couples.forEach(id -> coupleEventPublisher.publish(id, CoupleEvent.GAME));
        return targets.size();
    }
}
