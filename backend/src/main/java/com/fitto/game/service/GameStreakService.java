package com.fitto.game.service;

import com.fitto.common.time.KstClock;
import com.fitto.game.domain.GameStatus;
import com.fitto.game.dto.GameStreakResponse;
import com.fitto.game.repository.CoupleGameRepository;
import com.fitto.relation.domain.Relation;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.NavigableSet;
import java.util.TreeSet;

/**
 * 같이 게임한 날의 연속 기록 — docs/COUPLE_GAMES_EXPANSION_2026-09-14.md 3절.
 *
 * <p><b>종목을 가리지 않는다.</b> 스도쿠를 완성했든 오목을 끝냈든 그날은 "같이 한 날"이다.
 * 오늘의 판에만 걸면 자유 대국을 두 판 두고도 스트릭이 끊기는데, 그건 규칙이 아니라 벌이다.
 *
 * <p>접은 판(ABANDONED)은 세지 않는다 — 기록에 남기지 않는다는 두 게임의 공통 규칙 그대로다.
 */
@Service
@Transactional(readOnly = true)
public class GameStreakService {

    /**
     * 거슬러 올라가는 범위. 연속 기록은 끊기면 거기서 끝이므로 현재 스트릭에는 넉넉하고,
     * <b>최고 기록은 이 구간 안에서만</b> 본다(정확한 전체 최고치를 위해 컬럼을 두지는 않는다).
     */
    static final int LOOKBACK_DAYS = 400;

    private final CoupleGameRepository gameRepository;
    private final GameCouples couples;

    /**
     * {@code completed_at} 이 어느 TZ 벽시계로 적혔는지 — {@code MemoryDates.storageStartOfDay} 와
     * 같은 문제다. 운영(Railway)은 UTC 라 KST 00~09시 기록이 그냥 읽으면 전날로 잡힌다.
     */
    private final ZoneId storageZone;

    public GameStreakService(CoupleGameRepository gameRepository,
                             GameCouples couples,
                             @Value("${fitto.storage-zone:}") String storageZone) {
        this.gameRepository = gameRepository;
        this.couples = couples;
        this.storageZone = (storageZone == null || storageZone.isBlank())
                ? ZoneId.systemDefault()
                : ZoneId.of(storageZone);
    }

    public GameStreakResponse streak(Long userId) {
        Relation couple = couples.active(userId);
        LocalDate today = KstClock.today();
        LocalDateTime since = today.minusDays(LOOKBACK_DAYS).atStartOfDay(KstClock.ZONE)
                .withZoneSameInstant(storageZone).toLocalDateTime();

        List<LocalDateTime> completions =
                gameRepository.findCompletedAtSince(couple.getId(), GameStatus.COMPLETED, since);

        NavigableSet<LocalDate> days = new TreeSet<>();
        for (LocalDateTime at : completions) {
            if (at != null) days.add(toKstDate(at));
        }
        return summarize(days, today);
    }

    /** 저장된 벽시계 값 → KST 날짜 */
    private LocalDate toKstDate(LocalDateTime storedAt) {
        return storedAt.atZone(storageZone).withZoneSameInstant(KstClock.ZONE).toLocalDate();
    }

    /**
     * 날짜 집합 → 스트릭. 순수 계산이라 테스트가 날짜를 직접 넣어 확인한다.
     *
     * <p>오늘 아직 안 했으면 어제부터 센다 — 하루는 자정까지 남아 있는데 낮에 들어왔다고
     * "0일째"를 보여주면 이미 끊긴 것처럼 읽힌다.
     */
    public static GameStreakResponse summarize(NavigableSet<LocalDate> days, LocalDate today) {
        if (days.isEmpty()) {
            return new GameStreakResponse(0, 0, false, null);
        }

        boolean playedToday = days.contains(today);
        int current = 0;
        LocalDate cursor = playedToday ? today : today.minusDays(1);
        while (days.contains(cursor)) {
            current++;
            cursor = cursor.minusDays(1);
        }

        int best = 0;
        int run = 0;
        LocalDate previous = null;
        for (LocalDate day : days) {
            run = (previous != null && previous.plusDays(1).equals(day)) ? run + 1 : 1;
            previous = day;
            if (run > best) best = run;
        }

        return new GameStreakResponse(current, best, playedToday, days.last());
    }
}
